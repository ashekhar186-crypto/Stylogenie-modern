// backend/src/routes/chat.ts
// Wardrobe-aware GENIE fashion AI chat.
//
// Provider chain (text-only — vision handled separately by CLIP + Gemini):
//   1. Groq  (primary  — llama-3.1-8b-instant, ~700 tok/sec, 500K tok/day free)
//   2. Gemini (fallback — only if Groq quota exhausted, text-only call)
//
// Ollama and OpenRouter removed — Groq is faster and more reliable than both.

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { groqChatFull, groqEnabled } from "../lib/groq";
import { geminiChat, geminiEnabled } from "../lib/gemini";
import { buildWardrobeContext, fashionSystemPrompt } from "../lib/wardrobeContext";

const router = Router();

// Fallback system prompt when wardrobe fetch fails
const FALLBACK_SYSTEM_PROMPT = `You are GENIE — an elite AI fashion stylist with the taste of a Vogue editor.
Give specific, trend-aware, actionable fashion advice. Reference 2025 trends:
Quiet Luxury, Ballet Core, Dark Feminine, Office Siren, Y2K Revival, Ethnic Couture.
Be direct and opinionated — tell users exactly what to wear, not vague suggestions.`;

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const ChatBody = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
  wardrobeContext: z.boolean().optional().default(true),
});

function errStr(e: unknown): string {
  const d = (e as any)?.response?.data;
  if (typeof d === "string") return d;
  if (d?.error) return typeof d.error === "string" ? d.error : JSON.stringify(d.error);
  return (e as any)?.message ?? String(e);
}

/* ─── POST /chat ─── */
router.post("/", requireAuth, async (req, res) => {
  if (!groqEnabled && !geminiEnabled) {
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
        content:
          "Hey! I'm GENIE, your AI fashion stylist. Right now I'm running in demo mode — but I'm ready to discuss Quiet Luxury, Ballet Core, and everything 2025. What's on your style radar today? ✦",
      },
      provider: "mock",
    });
  }

  try {
    // ── Build system prompt (wardrobe-aware or general fashion) ──────────
    let systemContent = FALLBACK_SYSTEM_PROMPT;
    if (useWardrobe) {
      try {
        const context = await buildWardrobeContext(req.auth!.sub);
        systemContent = fashionSystemPrompt(context);
        console.log("[chat] Wardrobe context loaded for user:", req.auth!.sub);
      } catch (ctxErr) {
        console.warn("[chat] Wardrobe context failed, using fallback:", (ctxErr as any)?.message);
      }
    } else {
      console.log("[chat] General fashion mode (wardrobe context off)");
    }

    const aiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemContent },
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    const lastUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content ?? "";
    let replyContent = "";
    let usedProvider = "";

    // ── 1. Groq (primary — fast, free, reliable) ─────────────────────────
    if (groqEnabled) {
      console.log("[chat] Trying Groq…");
      const groqReply = await groqChatFull(aiMessages, 2000);
      if (groqReply?.trim()) {
        replyContent = groqReply.trim();
        usedProvider = "groq";
        console.log("[chat] Groq responded ✓");
      } else {
        console.warn("[chat] Groq returned empty — falling back to Gemini…");
      }
    }

    // ── 2. Gemini (fallback — only when Groq quota hit) ──────────────────
    // Build a full conversation transcript so Gemini has context, not just the last message.
    if (!replyContent && geminiEnabled) {
      console.log("[chat] Trying Gemini fallback…");
      const conversationTranscript = messages
        .map((m) => `${m.role === "user" ? "User" : "GENIE"}: ${m.content}`)
        .join("\n\n");
      const geminiUserMsg = `Here is the conversation so far:\n\n${conversationTranscript}\n\nNow reply as GENIE to the user's last message.`;
      const geminiReply = await geminiChat(systemContent, geminiUserMsg, 2000);
      if (geminiReply?.trim()) {
        replyContent = geminiReply.trim();
        usedProvider = "gemini";
        console.log("[chat] Gemini responded ✓");
      } else {
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
  } catch (e) {
    console.error("[chat] error:", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  }
});

export default router;
