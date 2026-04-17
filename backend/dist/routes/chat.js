"use strict";
// backend/src/routes/chat.ts
// Wardrobe-aware GENIE fashion AI chat.
//
// Provider chain (text-only — vision handled separately by CLIP + Gemini):
//   1. Groq  (primary  — llama-3.1-8b-instant, ~700 tok/sec, 500K tok/day free)
//   2. Gemini (fallback — only if Groq quota exhausted, text-only call)
//
// Ollama and OpenRouter removed — Groq is faster and more reliable than both.
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const zod_1 = require("zod");
const groq_1 = require("../lib/groq");
const gemini_1 = require("../lib/gemini");
const wardrobeContext_1 = require("../lib/wardrobeContext");
const router = (0, express_1.Router)();
// Fallback system prompt when wardrobe fetch fails
const FALLBACK_SYSTEM_PROMPT = `You are GENIE — an elite AI fashion stylist with the taste of a Vogue editor.
Give specific, trend-aware, actionable fashion advice. Reference 2025 trends:
Quiet Luxury, Ballet Core, Dark Feminine, Office Siren, Y2K Revival, Ethnic Couture.
Be direct and opinionated — tell users exactly what to wear, not vague suggestions.`;
const MessageSchema = zod_1.z.object({
    role: zod_1.z.enum(["user", "assistant"]),
    content: zod_1.z.string(),
});
const ChatBody = zod_1.z.object({
    messages: zod_1.z.array(MessageSchema).min(1).max(50),
    wardrobeContext: zod_1.z.boolean().optional().default(true),
});
function errStr(e) {
    const d = e?.response?.data;
    if (typeof d === "string")
        return d;
    if (d?.error)
        return typeof d.error === "string" ? d.error : JSON.stringify(d.error);
    return e?.message ?? String(e);
}
/* ─── POST /chat ─── */
router.post("/", auth_1.requireAuth, async (req, res) => {
    if (!groq_1.groqEnabled && !gemini_1.geminiEnabled) {
        return res.status(500).json({
            error: "No AI provider configured. Add GROQ_API_KEY to backend/.env — get a free key at console.groq.com",
        });
    }
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const { messages, wardrobeContext: useWardrobe } = parsed.data;
    if (process.env.MOCK_AI === "true") {
        return res.json({
            message: {
                role: "assistant",
                content: "Hey! I'm GENIE, your AI fashion stylist. Right now I'm running in demo mode — but I'm ready to discuss Quiet Luxury, Ballet Core, and everything 2025. What's on your style radar today? ✦",
            },
            provider: "mock",
        });
    }
    try {
        // ── Build system prompt (wardrobe-aware or general fashion) ──────────
        let systemContent = FALLBACK_SYSTEM_PROMPT;
        if (useWardrobe) {
            try {
                const context = await (0, wardrobeContext_1.buildWardrobeContext)(req.auth.sub);
                systemContent = (0, wardrobeContext_1.fashionSystemPrompt)(context);
                console.log("[chat] Wardrobe context loaded for user:", req.auth.sub);
            }
            catch (ctxErr) {
                console.warn("[chat] Wardrobe context failed, using fallback:", ctxErr?.message);
            }
        }
        else {
            console.log("[chat] General fashion mode (wardrobe context off)");
        }
        const aiMessages = [
            { role: "system", content: systemContent },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
        ];
        const lastUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";
        let replyContent = "";
        let usedProvider = "";
        // ── 1. Groq (primary — fast, free, reliable) ─────────────────────────
        if (groq_1.groqEnabled) {
            console.log("[chat] Trying Groq…");
            const groqReply = await (0, groq_1.groqChatFull)(aiMessages, 1000);
            if (groqReply?.trim()) {
                replyContent = groqReply.trim();
                usedProvider = "groq";
                console.log("[chat] Groq responded ✓");
            }
            else {
                console.warn("[chat] Groq returned empty — falling back to Gemini…");
            }
        }
        // ── 2. Gemini (fallback — only when Groq quota hit) ──────────────────
        if (!replyContent && gemini_1.geminiEnabled) {
            console.log("[chat] Trying Gemini fallback…");
            const geminiReply = await (0, gemini_1.geminiChat)(systemContent, lastUserMsg, 1000);
            if (geminiReply?.trim()) {
                replyContent = geminiReply.trim();
                usedProvider = "gemini";
                console.log("[chat] Gemini responded ✓");
            }
            else {
                console.warn("[chat] Gemini also returned empty");
            }
        }
        if (!replyContent)
            return res.status(502).json({
                error: "All AI providers failed. Check your GROQ_API_KEY and GEMINI_API_KEY in backend/.env",
            });
        return res.json({
            message: { role: "assistant", content: replyContent },
            provider: usedProvider,
        });
    }
    catch (e) {
        console.error("[chat] error:", errStr(e));
        return res.status(500).json({ error: errStr(e) });
    }
});
exports.default = router;
