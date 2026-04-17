// backend/src/routes/calendar.ts
// Feature 5: Outfit Calendar — plan outfits by date
// GET    /api/v1/calendar            — list all calendar entries (optional ?month=YYYY-MM)
// POST   /api/v1/calendar            — create or update an entry for a date
// DELETE /api/v1/calendar/:date      — remove entry for a date

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";
import { prisma } from "../db/prisma";

const router = Router();

const CalendarBody = z.object({
  date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  outfitLabel: z.string().max(120).optional(),
  itemIds:     z.array(z.string()).optional().default([]),
  outfitType:  z.string().optional(),
  occasion:    z.string().optional(),
  notes:       z.string().max(500).optional(),
  imageUrl:    z.string().url().optional(),
});

// Helper: detect missing-table errors (Prisma/Postgres) OR missing model (prisma generate not run)
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

// Guard: returns true if the OutfitCalendar model exists in the generated client
function calendarReady(): boolean {
  return typeof (prisma as any).outfitCalendar !== "undefined";
}

/* ─── GET /calendar ─── */
router.get("/", requireAuth, async (req, res) => {
  if (!calendarReady()) {
    return res.json({ entries: [], _migrationNeeded: true });
  }
  const { month } = req.query; // optional "YYYY-MM"
  try {
    const where: any = { userId: req.auth!.sub };
    if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month)) {
      // Compute actual last day of month for correct filtering
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
      const lastDateStr = `${month}-${String(lastDay).padStart(2, "0")}`;
      where.date = { gte: `${month}-01`, lte: lastDateStr };
    }
    const entries = await (prisma as any).outfitCalendar.findMany({
      where,
      orderBy: { date: "asc" },
    });

    // Enrich with item details
    const allItemIds: string[] = [...new Set<string>(entries.flatMap((e: any) => e.itemIds as string[]))];
    let itemsMap: Record<string, any> = {};
    if (allItemIds.length > 0) {
      const items = await prisma.item.findMany({
        where: { id: { in: allItemIds }, ownerId: req.auth!.sub },
        select: { id: true, imageUrl: true, title: true, section: true, dominantColorHex: true },
      });
      items.forEach((item) => { itemsMap[item.id] = item; });
    }

    const enriched = entries.map((e: any) => ({
      ...e,
      items: (e.itemIds as string[]).map((id: string) => itemsMap[id]).filter(Boolean),
    }));

    return res.json({ entries: enriched });
  } catch (e: any) {
    if (isMissingTableError(e)) {
      return res.json({ entries: [], _migrationNeeded: true });
    }
    return res.status(500).json({ error: e.message });
  }
});

/* ─── POST /calendar ─── */
router.post("/", requireAuth, async (req: any, res: any) => {
  if (!calendarReady()) {
    return res.status(503).json({ error: "Calendar feature requires a DB migration. Run: cd backend && npx prisma migrate dev && npx prisma generate", _migrationNeeded: true });
  }
  const parsed = CalendarBody.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { date, outfitLabel, itemIds, outfitType, occasion, notes, imageUrl } = parsed.data;

  try {
    const entry = await (prisma as any).outfitCalendar.upsert({
      where: { userId_date: { userId: req.auth!.sub, date } },
      create: {
        userId: req.auth!.sub,
        date,
        outfitLabel,
        itemIds,
        outfitType,
        occasion,
        notes,
        imageUrl,
      },
      update: { outfitLabel, itemIds, outfitType, occasion, notes, imageUrl },
    });
    return res.json({ entry });
  } catch (e: any) {
    if (isMissingTableError(e)) {
      return res.status(503).json({ error: "Calendar feature requires a DB migration. Run: cd backend && npx prisma migrate dev" });
    }
    return res.status(500).json({ error: e.message });
  }
});

/* ─── DELETE /calendar/:date ─── */
router.delete("/:date", requireAuth, async (req, res) => {
  if (!calendarReady()) return res.json({ ok: true }); // no-op if not migrated yet
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
    return res.status(400).json({ error: "Date must be YYYY-MM-DD" });
  }
  try {
    await (prisma as any).outfitCalendar.deleteMany({
      where: { userId: req.auth!.sub, date: req.params.date },
    });
    return res.json({ ok: true });
  } catch (e: any) {
    if (isMissingTableError(e)) {
      return res.json({ ok: true }); // no-op if table doesn't exist yet
    }
    return res.status(500).json({ error: e.message });
  }
});

export default router;
