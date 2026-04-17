"use strict";
// backend/src/lib/ollama.ts
// Local AI via Ollama — zero API keys, no rate limits, fully offline
//
// Setup (one-time):
//   1. Install: brew install ollama
//   2. Pull vision model: ollama pull llava    (4 GB) or ollama pull moondream (1.7 GB, faster)
//   3. Pull chat model:   ollama pull qwen2.5:7b
//
// Speed tips — start Ollama with flash attention for ~30% faster inference:
//   brew services stop ollama
//   OLLAMA_FLASH_ATTENTION=1 OLLAMA_KV_CACHE_TYPE=q8_0 ollama serve
//
// The backend will automatically detect if Ollama is running and use it.
// If Ollama is not running, this module silently falls through to Gemini/OpenRouter.
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ollamaChat = exports.ollamaVision = exports.isOllamaRunning = void 0;
const axios_1 = __importDefault(require("axios"));
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434";
// Vision model — llava:7b is the best quality; moondream is tiny (820 MB) but less precise
// Change OLLAMA_VISION_MODEL in .env to override
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL?.trim() || "llava";
// Chat model for text-only prompts
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL?.trim() || "qwen2.5:7b";
// In-process cache: whether Ollama is reachable (avoids spamming health checks)
let ollamaReachable = null;
let lastHealthCheck = 0;
const HEALTH_CACHE_MS = 30_000; // re-check every 30 seconds
// Timeout cooldown: if a vision call times out, skip Ollama for 10 minutes.
// This prevents a 2-minute penalty on every request when the model is too slow.
let ollamaTimeoutUntil = 0;
const TIMEOUT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
/**
 * Checks if the local Ollama server is up.
 * Caches the result for 30 seconds to avoid overhead on every request.
 */
async function isOllamaRunning() {
    const now = Date.now();
    if (ollamaReachable !== null && now - lastHealthCheck < HEALTH_CACHE_MS) {
        return ollamaReachable;
    }
    try {
        await axios_1.default.get(`${OLLAMA_BASE}/api/tags`, { timeout: 2_000 });
        ollamaReachable = true;
    }
    catch {
        ollamaReachable = false;
    }
    lastHealthCheck = now;
    return ollamaReachable;
}
exports.isOllamaRunning = isOllamaRunning;
/**
 * Converts a public image URL to base64.
 * Ollama cannot fetch remote URLs — it needs raw base64.
 */
async function urlToBase64(url) {
    try {
        const resp = await axios_1.default.get(url, {
            responseType: "arraybuffer",
            timeout: 15_000,
            maxContentLength: 12 * 1024 * 1024,
        });
        return Buffer.from(resp.data).toString("base64");
    }
    catch (e) {
        console.warn("[ollama] urlToBase64 failed:", e?.message?.slice(0, 80));
        return null;
    }
}
/**
 * Send an image + prompt to a local Ollama vision model (llava / moondream / etc.).
 *
 * imageSource: "data:image/...;base64,..."  OR  "https://..."
 * Returns the text response, or null if Ollama isn't running or fails.
 */
async function ollamaVision(prompt, imageSource, maxTokens = 800) {
    // Skip if still in timeout cooldown (model was too slow last time)
    if (Date.now() < ollamaTimeoutUntil) {
        const mins = Math.ceil((ollamaTimeoutUntil - Date.now()) / 60000);
        console.log(`[ollama] Vision skipped — in timeout cooldown for ${mins} more min(s)`);
        return null;
    }
    // Quick ping before attempting — avoids long timeout if Ollama is off
    if (!(await isOllamaRunning()))
        return null;
    // Resolve image to raw base64
    let base64;
    if (imageSource.startsWith("data:")) {
        const commaIdx = imageSource.indexOf(",");
        base64 = imageSource.slice(commaIdx + 1);
    }
    else if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
        const fetched = await urlToBase64(imageSource);
        if (!fetched)
            return null;
        base64 = fetched;
    }
    else {
        base64 = imageSource; // assume raw base64
    }
    try {
        console.log(`[ollama] Calling vision model: ${OLLAMA_VISION_MODEL}`);
        const { data } = await axios_1.default.post(`${OLLAMA_BASE}/api/generate`, {
            model: OLLAMA_VISION_MODEL,
            prompt,
            images: [base64],
            stream: false,
            keep_alive: -1, // keep model in RAM indefinitely — eliminates cold-start delay
            options: {
                num_predict: maxTokens,
                // IMPORTANT: vision models embed images as patch tokens — 256 is far too small
                // and causes the runner to crash ("resource limitations"). Min safe value = 2048.
                num_ctx: 2048,
                temperature: 0.2,
                top_p: 0.9,
                top_k: 20,
            },
        }, { timeout: 120_000 });
        const text = (data?.response ?? "").trim();
        if (!text) {
            console.warn("[ollama] Vision model returned empty response");
            return null;
        }
        console.log(`[ollama] Vision succeeded (${text.length} chars)`);
        return text;
    }
    catch (e) {
        const msg = e?.response?.data?.error ?? e?.message ?? "Ollama error";
        // Timeout = model is too slow on this hardware — enter cooldown
        if (msg.includes("timeout") || msg.includes("ETIMEDOUT")) {
            ollamaTimeoutUntil = Date.now() + TIMEOUT_COOLDOWN_MS;
            console.warn(`[ollama] Vision timed out — entering ${TIMEOUT_COOLDOWN_MS / 60000}-min cooldown. ` +
                `Tip: try a smaller model or use CLIP service instead.`);
            return null;
        }
        // If model not pulled yet, give a clear hint
        if (msg.includes("model") && (msg.includes("not found") || msg.includes("pull"))) {
            console.warn(`[ollama] Model "${OLLAMA_VISION_MODEL}" not found. Run: ollama pull ${OLLAMA_VISION_MODEL}`);
            ollamaReachable = false;
            return null;
        }
        // Connection refused = Ollama was stopped
        if (msg.includes("ECONNREFUSED") || msg.includes("connect ECONNREFUSED")) {
            ollamaReachable = false;
            return null;
        }
        console.warn("[ollama] Vision error:", msg.slice(0, 150));
        return null;
    }
}
exports.ollamaVision = ollamaVision;
/**
 * Send a text-only chat prompt to a local Ollama chat model.
 * Uses the OpenAI-compatible endpoint so it mirrors the OR/Gemini interface.
 * Returns text, or null if Ollama isn't available.
 */
async function ollamaChat(systemPrompt, userMessage, maxTokens = 1000) {
    if (!(await isOllamaRunning()))
        return null;
    try {
        console.log(`[ollama] Calling chat model: ${OLLAMA_CHAT_MODEL}`);
        const { data } = await axios_1.default.post(`${OLLAMA_BASE}/api/chat`, {
            model: OLLAMA_CHAT_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ],
            stream: false,
            keep_alive: -1, // keep model hot in RAM
            options: {
                num_predict: maxTokens,
                num_ctx: 512, // chat needs a bit more context than vision
                temperature: 0.6,
                top_k: 30,
            },
        }, { timeout: 120_000 });
        // Native /api/chat response: { message: { role, content }, done: true, ... }
        const text = (data?.message?.content ?? "").trim();
        if (!text) {
            console.warn("[ollama] Chat model returned empty response");
            return null;
        }
        console.log(`[ollama] Chat succeeded (${text.length} chars)`);
        return text;
    }
    catch (e) {
        const msg = e?.response?.data?.error ?? e?.message ?? "Ollama chat error";
        if (msg.includes("ECONNREFUSED")) {
            ollamaReachable = false;
            return null;
        }
        if (msg.includes("model") && msg.includes("not found")) {
            console.warn(`[ollama] Chat model "${OLLAMA_CHAT_MODEL}" not found. Run: ollama pull ${OLLAMA_CHAT_MODEL}`);
            return null;
        }
        console.warn("[ollama] Chat error:", msg.slice(0, 150));
        return null;
    }
}
exports.ollamaChat = ollamaChat;
