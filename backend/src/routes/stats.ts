// backend/src/routes/stats.ts
// Feature 15: Wardrobe Statistics Dashboard
// GET /api/v1/stats  — rich analytics over the user's wardrobe

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prisma";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.auth!.sub;

    // Fetch items — try with new columns first, fall back to base columns if migration not applied
    let items: any[];
    try {
      items = await (prisma.item.findMany as any)({
        where: { ownerId: userId, archived: false },
        select: {
          id: true, price: true, section: true, season: true, occasion: true,
          color: true, dominantColorHex: true, material: true, brand: true,
          styleEra: true, microTrend: true, trendiness: true, createdAt: true,
          wearCount: true, lastWorn: true, inLaundry: true,
        },
      });
    } catch {
      // Migration not run yet — fetch without wear-tracking columns
      items = await (prisma.item.findMany as any)({
        where: { ownerId: userId, archived: false },
        select: {
          id: true, price: true, section: true, season: true, occasion: true,
          color: true, dominantColorHex: true, material: true, brand: true,
          styleEra: true, microTrend: true, trendiness: true, createdAt: true,
        },
      });
      // Backfill missing fields with defaults
      items = items.map((i: any) => ({ ...i, wearCount: 0, lastWorn: null, inLaundry: false }));
    }

    const total = items.length;
    const totalValue = items.reduce((s: number, i: any) => s + (i.price ? Number(i.price) : 0), 0);

    // By section (skip uncategorised items)
    const bySection: Record<string, number> = {};
    items.forEach((i: any) => {
      if (!i.section) return; // skip items without section
      bySection[i.section] = (bySection[i.section] ?? 0) + 1;
    });

    // By season (skip unknown)
    const bySeason: Record<string, number> = {};
    items.forEach((i: any) => {
      if (!i.season) return;
      bySeason[i.season] = (bySeason[i.season] ?? 0) + 1;
    });

    // By occasion (skip unknown)
    const byOccasion: Record<string, number> = {};
    items.forEach((i: any) => {
      if (!i.occasion) return;
      byOccasion[i.occasion] = (byOccasion[i.occasion] ?? 0) + 1;
    });

    // By micro-trend
    const byTrend: Record<string, number> = {};
    items.forEach((i: any) => {
      if (i.microTrend) byTrend[i.microTrend] = (byTrend[i.microTrend] ?? 0) + 1;
    });

    // Top brands
    const byBrand: Record<string, number> = {};
    items.forEach((i: any) => {
      if (i.brand) byBrand[i.brand] = (byBrand[i.brand] ?? 0) + 1;
    });
    const topBrands = Object.entries(byBrand).sort((a, b) => b[1] - a[1]).slice(0, 8);

    // Cost per wear
    const costPerWear = items
      .filter((i: any) => i.price && Number(i.price) > 0 && (i.wearCount ?? 0) > 0)
      .map((i: any) => ({ id: i.id, price: Number(i.price), wearCount: i.wearCount, cpw: Number(i.price) / i.wearCount }))
      .sort((a: any, b: any) => a.cpw - b.cpw)
      .slice(0, 10);

    // Most worn
    const mostWorn = items
      .filter((i: any) => (i.wearCount ?? 0) > 0)
      .sort((a: any, b: any) => b.wearCount - a.wearCount)
      .slice(0, 8)
      .map((i: any) => ({ id: i.id, wearCount: i.wearCount }));

    const neverWorn = items.filter((i: any) => (i.wearCount ?? 0) === 0).length;
    const inLaundry = items.filter((i: any) => i.inLaundry).length;

    // Average trendiness
    const trendinessScores = items.filter((i: any) => i.trendiness != null).map((i: any) => i.trendiness as number);
    const avgTrendiness = trendinessScores.length
      ? trendinessScores.reduce((s: number, t: number) => s + t, 0) / trendinessScores.length
      : null;

    // Color palette
    const colorCount: Record<string, number> = {};
    items.forEach((i: any) => {
      if (i.dominantColorHex) colorCount[i.dominantColorHex] = (colorCount[i.dominantColorHex] ?? 0) + 1;
    });
    const topColors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([hex, count]) => ({ hex, count }));

    // Items added per month (last 12 months)
    const now = new Date();
    const addedByMonth: Record<string, number> = {};
    for (let m = 11; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      addedByMonth[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = 0;
    }
    items.forEach((i: any) => {
      const d = new Date(i.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in addedByMonth) addedByMonth[key]++;
    });

    // Gap analysis
    const IDEAL: Record<string, number> = {
      Tops: 0.22, Bottoms: 0.18, Dresses: 0.12, Outerwear: 0.08,
      Footwear: 0.12, Accessories: 0.10, Ethnicwear: 0.10, Sportswear: 0.08,
    };
    const gapAnalysis = Object.entries(IDEAL).map(([section, ideal]) => {
      const actual = (bySection[section] ?? 0) / Math.max(total, 1);
      return { section, idealPct: Math.round(ideal * 100), actualPct: Math.round(actual * 100), gap: actual < ideal };
    });

    return res.json({
      total, totalValue: Math.round(totalValue * 100) / 100, neverWorn, inLaundry,
      avgTrendiness: avgTrendiness ? Math.round(avgTrendiness * 100) / 100 : null,
      bySection, bySeason, byOccasion, byTrend, topBrands, topColors,
      costPerWear, mostWorn, addedByMonth, gapAnalysis,
    });
  } catch (e: any) {
    console.error("[stats]", e.message);
    return res.status(500).json({ error: e.message });
  }
});

export default router;
