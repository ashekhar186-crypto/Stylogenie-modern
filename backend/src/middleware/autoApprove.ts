// backend/src/middleware/autoApprove.ts
// Ensures every wardrobe item is marked approved so ALL features (recommend,
// style chat, trip planner, stats) can use the full wardrobe immediately —
// without requiring the user to visit /wardrobe first.
//
// Applied as route-level middleware on all authenticated AI feature routes.
// Uses a per-user in-memory cooldown so it only fires once per minute, not
// on every single request.

import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";

const lastRun = new Map<string, number>(); // userId → timestamp
const COOLDOWN_MS = 60_000; // run at most once per minute per user

export async function autoApproveWardrobe(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const userId = (req as any).auth?.sub;
  if (!userId) { next(); return; }

  const now = Date.now();
  const last = lastRun.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) { next(); return; }

  // Fire-and-forget — never blocks the response
  lastRun.set(userId, now);
  prisma.item.updateMany({
    where: { ownerId: userId, approved: false },
    data: { approved: true },
  }).catch(() => {});

  next();
}
