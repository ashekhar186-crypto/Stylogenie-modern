// Gemini Flash — PRIMARY vision model + chat fallback (free, 1,500 req/day)
// Get your free key at: https://aistudio.google.com
// Set GEMINI_API_KEY in your .env to activate.

import axios from "axios";

const GEMINI_KEY = process.env.GEMINI_API_KEY?.trim();
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

// Vision models in priority order
// gemini-2.0-flash       → primary (best quality, 15 RPM free)
// gemini-2.0-flash-lite  → backup  (higher RPM allowance, faster, also free)
const GEMINI_VISION_PRIMARY = "gemini-2.0-flash";
const GEMINI_VISION_BACKUP  = "gemini-2.0-flash-lite";
const GEMINI_CHAT_MODEL     = "gemini-2.0-flash";

export const geminiEnabled = !!GEMINI_KEY;

// Safety settings: BLOCK_NONE on all categories so fashion photos with faces
// are never blocked by Gemini's content filters.
// Sexually-explicit content is kept at BLOCK_ONLY_HIGH as a reasonable guard.
const FASHION_SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH",        threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT",  threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",  threshold: "BLOCK_ONLY_HIGH" },
];

function errMsg(e: unknown): string {
  const d = (e as any)?.response?.data;
  if (d?.error?.message) return d.error.message;
  return (e as any)?.message ?? "Gemini error";
}

/**
 * Fetch a public image URL and convert to base64 inline_data.
 * More reliable than letting Gemini fetch it via file_data.
 */
async function urlToInlineData(url: string): Promise<{ mime_type: string; data: string } | null> {
  try {
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15_000,
      maxContentLength: 12 * 1024 * 1024,
    });
    const mime = String(resp.headers["content-type"] || "image/jpeg").split(";")[0].trim();
    if (!mime.startsWith("image/")) {
      console.warn("[gemini] urlToInlineData: unexpected mime type:", mime);
      return null;
    }
    const data = Buffer.from(resp.data).toString("base64");
    console.log(`[gemini] Fetched image: ${mime}, ${Math.round(data.length * 0.75 / 1024)}KB`);
    return { mime_type: mime, data };
  } catch (e) {
    console.warn("[gemini] urlToInlineData failed:", errMsg(e));
    return null;
  }
}

/**
 * Extract the "retry after N seconds" value from a Gemini 429 error message.
 * Returns the delay in ms, or 0 if not found.
 */
function extractRetryAfterMs(errorMessage: string): number {
  const match = errorMessage.match(/retry in ([\d.]+)s/i);
  if (match) return Math.ceil(parseFloat(match[1]) * 1000);
  return 0;
}

/**
 * Call a Gemini model with a vision request.
 * On 429 rate-limit: waits up to 15s then retries once.
 * Returns text on success, null on any other failure (with detailed logging).
 */
async function callGeminiVision(
  model: string,
  imagePart: any,
  prompt: string,
  maxTokens: number
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await axios.post(
        `${GEMINI_BASE}/models/${model}:generateContent?key=${GEMINI_KEY}`,
        {
          contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
          safetySettings: FASHION_SAFETY_SETTINGS,
        },
        { timeout: 60_000 }
      );

      // Check for prompt-level block
      const blockReason = data?.promptFeedback?.blockReason;
      if (blockReason) {
        console.warn(`[gemini/${model}] Prompt blocked: ${blockReason}`);
        return null;
      }

      const candidate = data?.candidates?.[0];
      const finishReason = candidate?.finishReason;

      if (finishReason && finishReason !== "STOP" && finishReason !== "MAX_TOKENS") {
        console.warn(`[gemini/${model}] Unusual finishReason: ${finishReason}`, JSON.stringify(candidate?.safetyRatings ?? []));
      }

      const text = candidate?.content?.parts?.[0]?.text?.trim() ?? null;
      if (!text) {
        console.warn(`[gemini/${model}] No text in response. finishReason=${finishReason}, candidate keys=${Object.keys(candidate ?? {}).join(",")}`);
      }
      return text;
    } catch (e: any) {
      const msg = errMsg(e);
      const httpStatus = e?.response?.status;

      // On rate-limit (429): wait up to 15 s then retry once
      if (httpStatus === 429 && attempt === 0) {
        const waitMs = Math.min(extractRetryAfterMs(msg), 15_000);
        if (waitMs > 0) {
          console.warn(`[gemini/${model}] Rate-limited. Waiting ${waitMs}ms then retrying…`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue; // retry
        }
      }

      console.warn(`[gemini/${model}] API error (attempt ${attempt + 1}):`, msg.slice(0, 200));
      return null;
    }
  }
  return null;
}

/**
 * Send a text-only prompt to Gemini Flash.
 * Returns the text response, or null if Gemini is not configured / fails.
 */
export async function geminiChat(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2000
): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  try {
    const { data } = await axios.post(
      `${GEMINI_BASE}/models/${GEMINI_CHAT_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.6 },
      },
      { timeout: 60_000 }
    );
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!text) console.warn("[gemini/chat] Empty response");
    return text;
  } catch (e) {
    console.warn("[gemini] chat failed:", errMsg(e));
    return null;
  }
}

/**
 * Send an image + prompt to Gemini Vision.
 * Tries gemini-2.0-flash first, then gemini-1.5-flash if blocked/empty.
 * Automatically fetches public URLs and converts to base64 inline_data.
 * Returns the text response, or null if both models fail.
 */
export async function geminiVision(
  prompt: string,
  imageSource: string, // "data:image/...;base64,..." OR "https://..."
  maxTokens = 1000
): Promise<string | null> {
  if (!GEMINI_KEY) return null;

  // Build the image part (inline_data is most reliable)
  let imagePart: any;
  if (imageSource.startsWith("data:")) {
    const commaIdx = imageSource.indexOf(",");
    const header   = imageSource.slice(0, commaIdx);
    const b64      = imageSource.slice(commaIdx + 1);
    const mimeType = header.replace("data:", "").replace(";base64", "");
    imagePart = { inline_data: { mime_type: mimeType, data: b64 } };
    console.log("[gemini] Using base64 inline_data");
  } else {
    const fetched = await urlToInlineData(imageSource);
    if (fetched) {
      imagePart = { inline_data: fetched };
    } else {
      // Hard fallback — some Gemini endpoints support direct URLs
      console.warn("[gemini] URL fetch failed, attempting direct URI (may not work)");
      imagePart = { file_data: { mime_type: "image/jpeg", file_uri: imageSource } };
    }
  }

  // ── Try primary model ──
  console.log(`[gemini] Calling vision: ${GEMINI_VISION_PRIMARY}`);
  const primary = await callGeminiVision(GEMINI_VISION_PRIMARY, imagePart, prompt, maxTokens);
  if (primary) return primary;

  // ── Try backup model ──
  console.log(`[gemini] Primary returned null — trying backup: ${GEMINI_VISION_BACKUP}`);
  const backup = await callGeminiVision(GEMINI_VISION_BACKUP, imagePart, prompt, maxTokens);
  if (backup) return backup;

  console.warn("[gemini] Both vision models returned null");
  return null;
}
