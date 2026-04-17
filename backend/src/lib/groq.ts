// backend/src/lib/groq.ts
// Groq inference — extremely fast LLM API, generous free tier.
//
// Free tier (llama-3.1-8b-instant):
//   • 14,400 requests/day
//   • 500,000 tokens/day
//   • 30,000 tokens/minute
//
// Get a free API key at: https://console.groq.com
// Add to backend/.env:  GROQ_API_KEY=gsk_...

import axios from "axios";

const GROQ_KEY  = process.env.GROQ_API_KEY?.trim();
const GROQ_BASE = "https://api.groq.com/openai/v1";

// Best free model: fast, smart, generous daily quota
// llama-3.1-8b-instant → 500K tokens/day, ~700 tok/sec
// llama-3.3-70b-versatile → smarter but tighter quota (100K tokens/day)
const GROQ_CHAT_MODEL =
  process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.1-8b-instant";

export const groqEnabled = !!GROQ_KEY;

const client = axios.create({
  baseURL: GROQ_BASE,
  timeout: 30_000,
});

client.interceptors.request.use((cfg) => {
  cfg.headers = cfg.headers ?? {};
  cfg.headers["Authorization"] = `Bearer ${GROQ_KEY}`;
  cfg.headers["Content-Type"]  = "application/json";
  return cfg;
});

function errMsg(e: unknown): string {
  const d = (e as any)?.response?.data;
  if (typeof d === "string") return d;
  if (d?.error?.message) return d.error.message;
  if (d?.error) return JSON.stringify(d.error);
  return (e as any)?.message ?? String(e);
}

/**
 * Single chat turn with Groq.
 * Returns the reply string, or null on failure (caller decides fallback).
 * Pass `model` to override the default GROQ_CHAT_MODEL for specific calls.
 */
export async function groqChat(
  system: string,
  userMessage: string,
  maxTokens = 1000,
  model?: string,
): Promise<string | null> {
  if (!GROQ_KEY) return null;

  try {
    const { data } = await client.post("/chat/completions", {
      model: model ?? GROQ_CHAT_MODEL,
      messages: [
        { role: "system",  content: system      },
        { role: "user",    content: userMessage  },
      ],
      max_tokens:  maxTokens,
      temperature: 0.75,
    });

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn("[groq] Empty response from model");
      return null;
    }
    return text;
  } catch (e) {
    const msg = errMsg(e);
    const status = (e as any)?.response?.status;
    if (status === 429) {
      console.warn("[groq] Rate-limited (429) — daily/minute quota hit");
    } else {
      console.warn("[groq] chat failed:", msg.slice(0, 200));
    }
    return null;
  }
}

/**
 * Full conversation turn with Groq — preserves multi-turn message history.
 * Pass the full messages array (including system) already formatted.
 */
export async function groqChatFull(
  messages: { role: "system" | "user" | "assistant"; content: string }[],
  maxTokens = 1000,
): Promise<string | null> {
  if (!GROQ_KEY) return null;

  try {
    const { data } = await client.post("/chat/completions", {
      model: GROQ_CHAT_MODEL,
      messages,
      max_tokens:  maxTokens,
      temperature: 0.75,
    });

    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn("[groq] Empty response from model");
      return null;
    }
    return text;
  } catch (e) {
    const msg = errMsg(e);
    const status = (e as any)?.response?.status;
    if (status === 429) {
      console.warn("[groq] Rate-limited (429) — daily/minute quota hit");
    } else {
      console.warn("[groq] chat failed:", msg.slice(0, 200));
    }
    return null;
  }
}
