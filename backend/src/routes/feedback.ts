// backend/src/routes/feedback.ts
// Feature 1: Outfit Memory & Learning — persist like/dislike/save reactions per outfit
// POST /api/v1/feedback        — upsert reaction
// GET  /api/v1/feedback        — get all reactions for user
// DELETE /api/v1/feedback/:hash — remove a reaction

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { prisma } from "../db/prisma";
import crypto from "crypto";

const router = Router();

const FeedbackBody = z.object({
  itemIds:    z.array(z.string()).min(1),
  reaction:   z.enum(["like", "dislike", "save"]),
  outfitType: z.string().optional(),
  occasion:   z.string().optional(),
  notes:      z.string().max(500).optional(),
});

// Deterministic outfit hash from sorted item IDs
function outfitHash(itemIds: string[]): string {
  const sorted = [...itemIds].sort().join(",");
  return crypto.createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}

function isMissingTableError(e: any): boolean {
  const msg: string = e?.message ?? "";
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("P2021") ||
    msg.includes("P2022") ||
    msg.includes("Cannot read properties of undefined") // prisma generate not yet run
  );
}

function feedbackReady(): boolean {
  return typeof (prisma as any).outfitFeedback !== "undefined";
}

/* ─── POST /feedback ─── */
router.post("/", requireAuth, async (req, res) => {
  if (!feedbackReady()) {
    return res.status(503).json({ error: "Feedback feature requires a DB migration. Run: cd backend && npx prisma migrate dev && npx prisma generate" });
  }
  const parsed = FeedbackBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { itemIds, reaction, outfitType, occasion, notes } = parsed.data;
  const hash = outfitHash(itemIds);

  try {
    const feedback = await (prisma as any).outfitFeedback.upsert({
      where: { userId_outfitHash: { userId: req.auth!.sub, outfitHash: hash } },
      create: {
        userId: req.auth!.sub,
        outfitHash: hash,
        reaction,
        outfitType,
        occasion,
        itemIds,
        notes,
      },
      update: { reaction, outfitType, occasion, notes },
    });
    return res.json({ feedback, hash });
  } catch (e: any) {
    if (isMissingTableError(e)) {
      return res.status(503).json({ error: "Feedback feature requires a DB migration. Run: cd backend && npx prisma migrate dev" });
    }
    return res.status(500).json({ error: e.message });
  }
});

/* ─── GET /feedback ─── */
router.get("/", requireAuth, async (req, res) => {
  if (!feedbackReady()) {
    return res.json({ reactions: [], map: {}, _migrationNeeded: true });
  }
  try {
    const reactions = await (prisma as any).outfitFeedback.findMany({
      where: { userId: req.auth!.sub },
      orderBy: { createdAt: "desc" },
    });
    // Build a quick hash→reaction map for the frontend to use
    const map: Record<string, string> = {};
    reactions.forEach((r: any) => { map[r.outfitHash] = r.reaction; });
    return res.json({ reactions, map });
  } catch (e: any) {
    if (isMissingTableError(e)) {
      return res.json({ reactions: [], map: {}, _migrationNeeded: true });
    }
    return res.status(500).json({ error: e.message });
  }
});

/* ─── DELETE /feedback/:hash ─── */
router.delete("/:hash", requireAuth, async (req, res) => {
  if (!feedbackReady()) return res.json({ ok: true });
  try {
    await (prisma as any).outfitFeedback.deleteMany({
      where: { userId: req.auth!.sub, outfitHash: req.params.hash },
    });
    return res.json({ ok: true });
  } catch (e: any) {
    if (isMissingTableError(e)) {
      return res.json({ ok: true }); // no-op if table doesn't exist yet
    }
    return res.status(500).json({ error: e.message });
  }
});

export { outfitHash };
export default router;
