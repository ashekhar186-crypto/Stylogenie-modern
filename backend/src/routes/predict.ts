// backend/src/routes/predict.ts
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prisma";
import { z } from "zod";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import path from "path";
import { mapSectionGuess } from "../lib/mapSectionGuess";
import { orClient } from "../lib/openrouter";

const router = Router();

/* ------------------------------- uploads ------------------------------- */
const uploadDir = path.join(process.cwd(), ".uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/\s+/g, "_");
    cb(null, `${ts}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
  fileFilter: (_req, file, cb) =>
    /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Only image files are allowed")),
});

/* ------------------------------- models -------------------------------- */
// Text/chat model (no image needed)
const MODEL_CHAT =
  process.env.OPENROUTER_MODEL_CHAT?.trim() || "qwen/qwen2.5-72b-instruct";

// Vision model candidates (try in order until one works for image input)
const VISION_MODELS: string[] = (
  process.env.OPENROUTER_MODEL_VISION_LIST?.trim() ||
  // sensible defaults known to work on OpenRouter (no ":free" suffixes)
  "qwen/qwen-2.5-vl-7b-instruct,qwen/qwen-2.5-vl-32b-instruct,meta-llama/llama-3.2-11b-vision-instruct"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const SYSTEM_PROMPT =
  "You are a fashion item classifier. Reply with ONE concise line describing the item: type, category, color(s), and material if obvious.";

/* -------------------------------- zod ---------------------------------- */
const ChatBody = z.object({ prompt: z.string().min(1, "prompt required") });
const VisionBodyUrl = z.object({
  imageUrl: z.string().url("imageUrl must be a valid URL"),
  saveItem: z.boolean().optional().default(false),
});

/* ------------------------------- helpers ------------------------------- */
function maybeMock(): string | null {
  if (process.env.MOCK_AI === "true") {
    return "Light grey shirt with black trousers; smart-casual cotton blend outfit";
  }
  return null;
}

function errorString(err: unknown): string {
  const data = (err as any)?.response?.data;
  if (typeof data === "string") return data;
  if (data?.error) return typeof data.error === "string" ? data.error : JSON.stringify(data.error);
  if ((err as any)?.message) return (err as any).message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

async function withSmallRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      last = e;
      const status = Number(e?.status) || Number(e?.response?.status);
      if (status === 429 || status >= 500) {
        await new Promise((r) => setTimeout(r, i === 0 ? 700 : 1200));
        continue;
      }
      break;
    }
  }
  throw last;
}

async function assertDirectImage(url: string) {
  // Some CDNs 403/404 on HEAD; try HEAD first, then GET a single byte.
  let status = 0;
  let ct = "";

  try {
    const head = await axios.head(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
    status = head.status;
    ct = String(head.headers["content-type"] || "").toLowerCase();
  } catch {
    // Fallback: GET first byte
    const get = await axios.get(url, {
      timeout: 8000,
      maxRedirects: 3,
      responseType: "stream",
      headers: { Range: "bytes=0-0" },
      validateStatus: () => true,
    });
    status = get.status;
    ct = String(get.headers["content-type"] || "").toLowerCase();
    try {
      (get.data as any)?.destroy?.();
    } catch {}
  }

  if (!(status >= 200 && status < 400) || !ct.startsWith("image/")) {
    throw new Error(`imageUrl is not a direct public image. status=${status}, content-type=${ct}`);
  }
}

/* --------------- OpenRouter calls (chat + vision with fallback) -------- */
async function orChat(prompt: string): Promise<string> {
  const { data } = await orClient.post("/v1/chat/completions", {
    model: MODEL_CHAT,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });
  return data?.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Try each candidate vision model until one accepts image input. */
async function orVisionDescribeWithFallback(
  imageUrlOrDataUrl: string
): Promise<{ text: string; usedModel: string }> {
  let lastErr: any;
  for (const model of VISION_MODELS) {
    try {
      const { data } = await orClient.post("/v1/chat/completions", {
        model,
        // multimodal content: text + image
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify the clothing item and key attributes." },
              { type: "image_url", image_url: { url: imageUrlOrDataUrl } },
            ],
          },
        ],
        max_tokens: 300,
      });
      const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return { text, usedModel: model };
      // empty → try next
      lastErr = new Error("Model returned empty content");
    } catch (e: any) {
      lastErr = e;
      const msg = errorString(e).toLowerCase();
      const code = (e?.response?.data?.code || "").toString();
      // try next on "no endpoints" / "no image support" / 404
      if (msg.includes("no endpoints found") || msg.includes("support image") || code === "404") {
        console.warn(`[vision] ${model} rejected image input, trying next...`);
        continue;
      }
      // other errors → stop looping
      break;
    }
  }
  throw lastErr;
}

/* -------------------------- POST /predict/chat ------------------------- */
router.post("/chat", requireAuth, async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY)
    return res.status(500).json({ error: "OPENROUTER_API_KEY missing in backend/.env" });

  const parsed = ChatBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const mock = maybeMock();
  if (mock) return res.json({ text: mock });

  try {
    console.log("[chat] model=", MODEL_CHAT);
    const text = await withSmallRetry(() => orChat(parsed.data.prompt));
    return res.json({ text });
  } catch (e) {
    console.error("predict chat error:", errorString(e));
    return res.status(500).json({ error: errorString(e) });
  }
});

/* ----------------------------- POST /predict --------------------------- */
router.post("/", requireAuth, async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY)
    return res.status(500).json({ error: "OPENROUTER_API_KEY missing in backend/.env" });

  const parsed = VisionBodyUrl.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { imageUrl, saveItem } = parsed.data;

  const mock = maybeMock();
  if (mock) {
    const section = mapSectionGuess(mock);
    return res.json({ text: mock, section, item: null, model: "mock" });
  }

  try {
    await assertDirectImage(imageUrl);

    console.log("[vision:url] candidates=", VISION_MODELS.join(" | "));
    const { text, usedModel } = await withSmallRetry(() => orVisionDescribeWithFallback(imageUrl));
    if (!text) return res.status(502).json({ error: "Model returned empty content" });

    const section = mapSectionGuess(text);

    let item: any = null;
    if (saveItem) {
      item = await prisma.item.create({
        data: {
          ownerId: req.auth!.sub,
          imageUrl,
          title: text.slice(0, 120) || "Predicted item",
          section,
          approved: false,
        },
      });
    }

    return res.json({ text, section, item, model: usedModel });
  } catch (e) {
    console.error("predict URL error:", errorString(e));
    return res.status(500).json({ error: errorString(e) });
  }
});

/* ----------------------- POST /predict/upload -------------------------- */
router.post("/upload", requireAuth, upload.single("image"), async (req, res) => {
  if (!process.env.OPENROUTER_API_KEY)
    return res.status(500).json({ error: "OPENROUTER_API_KEY missing in backend/.env" });

  const saveItem = req.body?.saveItem === "true" || req.body?.saveItem === true;

  const mock = maybeMock();
  if (mock) {
    const section = mapSectionGuess(mock);
    return res.json({ text: mock, section, item: null, imageUrl: "", model: "mock" });
  }

  if (!req.file) return res.status(400).json({ error: "image file is required" });

  const filePath = req.file.path;
  try {
    // Convert file → data URL for multimodal call
    const buf = fs.readFileSync(filePath);
    const b64 = buf.toString("base64");
    const mime = req.file.mimetype || "image/jpeg";
    const dataUrl = `data:${mime};base64,${b64}`;

    console.log("[vision:upload] candidates=", VISION_MODELS.join(" | "));
    const { text, usedModel } = await withSmallRetry(() => orVisionDescribeWithFallback(dataUrl));
    if (!text) return res.status(502).json({ error: "Model returned empty content" });

    const section = mapSectionGuess(text);

    let item: any = null;
    if (saveItem) {
      item = await prisma.item.create({
        data: {
          ownerId: req.auth!.sub,
          imageUrl: "", // not hosting in the demo
          title: text.slice(0, 120) || "Predicted item",
          section,
          approved: false,
        },
      });
    }

    return res.json({ text, section, item, imageUrl: "", model: usedModel });
  } catch (e) {
    console.error("predict upload error:", errorString(e));
    return res.status(500).json({ error: errorString(e) });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {}
  }
});

export default router;
