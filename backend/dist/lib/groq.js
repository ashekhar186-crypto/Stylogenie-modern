"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.groqChatFull = exports.groqChat = exports.groqEnabled = void 0;
const axios_1 = __importDefault(require("axios"));
const GROQ_KEY = process.env.GROQ_API_KEY?.trim();
const GROQ_BASE = "https://api.groq.com/openai/v1";
// Best free model: fast, smart, generous daily quota
// llama-3.1-8b-instant → 500K tokens/day, ~700 tok/sec
// llama-3.3-70b-versatile → smarter but tighter quota (100K tokens/day)
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.1-8b-instant";
exports.groqEnabled = !!GROQ_KEY;
const client = axios_1.default.create({
    baseURL: GROQ_BASE,
    timeout: 30_000,
});
client.interceptors.request.use((cfg) => {
    cfg.headers = cfg.headers ?? {};
    cfg.headers["Authorization"] = `Bearer ${GROQ_KEY}`;
    cfg.headers["Content-Type"] = "application/json";
    return cfg;
});
function errMsg(e) {
    const d = e?.response?.data;
    if (typeof d === "string")
        return d;
    if (d?.error?.message)
        return d.error.message;
    if (d?.error)
        return JSON.stringify(d.error);
    return e?.message ?? String(e);
}
/**
 * Single chat turn with Groq.
 * Returns the reply string, or null on failure (caller decides fallback).
 * Pass `model` to override the default GROQ_CHAT_MODEL for specific calls.
 */
async function groqChat(system, userMessage, maxTokens = 1000, model) {
    if (!GROQ_KEY)
        return null;
    try {
        const { data } = await client.post("/chat/completions", {
            model: model ?? GROQ_CHAT_MODEL,
            messages: [
                { role: "system", content: system },
                { role: "user", content: userMessage },
            ],
            max_tokens: maxTokens,
            temperature: 0.75,
        });
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
            console.warn("[groq] Empty response from model");
            return null;
        }
        return text;
    }
    catch (e) {
        const msg = errMsg(e);
        const status = e?.response?.status;
        if (status === 429) {
            console.warn("[groq] Rate-limited (429) — daily/minute quota hit");
        }
        else {
            console.warn("[groq] chat failed:", msg.slice(0, 200));
        }
        return null;
    }
}
exports.groqChat = groqChat;
/**
 * Full conversation turn with Groq — preserves multi-turn message history.
 * Pass the full messages array (including system) already formatted.
 */
async function groqChatFull(messages, maxTokens = 1000) {
    if (!GROQ_KEY)
        return null;
    try {
        const { data } = await client.post("/chat/completions", {
            model: GROQ_CHAT_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature: 0.75,
        });
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (!text) {
            console.warn("[groq] Empty response from model");
            return null;
        }
        return text;
    }
    catch (e) {
        const msg = errMsg(e);
        const status = e?.response?.status;
        if (status === 429) {
            console.warn("[groq] Rate-limited (429) — daily/minute quota hit");
        }
        else {
            console.warn("[groq] chat failed:", msg.slice(0, 200));
        }
        return null;
    }
}
exports.groqChatFull = groqChatFull;
