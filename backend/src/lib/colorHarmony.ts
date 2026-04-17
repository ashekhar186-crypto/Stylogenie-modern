// backend/src/lib/colorHarmony.ts
// Color theory utilities for outfit compatibility scoring.
//
// Uses HSL color space (Hue 0-360°, Saturation 0-1, Lightness 0-1).
// Neutral colors (black, white, grey, beige, cream, navy) are compatible with everything.
//
// Scoring weights (revised with 2025 trend alignment):
//   Color harmony   35%
//   Trend alignment 20%
//   Occasion match  20%
//   Season fit      15%
//   Style era       10%

// ─── 2025 Trend scores (mirror of wardrobeContext.ts TREND_SCORES) ────────────
// Kept here so colorHarmony.ts has zero circular import risk.
const TREND_SCORES_2025: Record<string, number> = {
  "Quiet Luxury":          0.97,
  "Office Siren":          0.94,
  "Ballet Core":           0.91,
  "Dark Feminine":         0.90,
  "Clean Girl Aesthetic":  0.89,
  "Streetwear Luxe":       0.88,
  "Y2K Revival":           0.86,
  "Ethnic Couture":        0.85,
  "Preppy Revival":        0.83,
  "Cottagecore":           0.82,
  "Athleisure Luxe":       0.81,
  "Gorpcore":              0.80,
  "Coastal Grandmother":   0.76,
  "Mob Wife Aesthetic":    0.74,
  // Fallback for items classified with older trend names
  "Mob Wife":              0.74,
  "Contemporary":          0.72,
};

/** Get the 2025 trendiness score for a micro-trend label (0-1). */
export function trendScore(microTrend: string | null | undefined): number {
  if (!microTrend) return 0.72;
  return TREND_SCORES_2025[microTrend] ?? 0.72;
}

/**
 * Score the trend alignment of an outfit.
 * Awards a bonus when ALL items share the same dominant trend (cohesion).
 */
export function outfitTrendScore(microTrends: (string | null | undefined)[]): {
  score: number;
  dominantTrend: string;
  trendiness: number;
} {
  const valid = microTrends.filter(Boolean) as string[];
  if (valid.length === 0) return { score: 0.72, dominantTrend: "Contemporary", trendiness: 0.72 };

  const counts = new Map<string, number>();
  valid.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const dominantFraction = (counts.get(dominant) ?? 0) / valid.length;

  // Base trendiness = weighted average of individual trend scores
  const avgTrendiness = valid.reduce((sum, t) => sum + trendScore(t), 0) / valid.length;

  // Cohesion bonus: if all items share the same trend, add 0.05
  const cohesionBonus = dominantFraction === 1.0 ? 0.05 : 0;
  const finalScore = Math.min(1.0, avgTrendiness + cohesionBonus);

  return { score: finalScore, dominantTrend: dominant, trendiness: avgTrendiness };
}

/** Convert #rrggbb hex to [h, s, l] */
export function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l]; // achromatic

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / d + 2) / 6;
  else hue = ((r - g) / d + 4) / 6;

  return [Math.round(hue * 360), s, l];
}

/** True if a color is effectively neutral (low saturation or near-white/black) */
function isNeutral(hsl: [number, number, number]): boolean {
  const [, s, l] = hsl;
  return s < 0.15 || l < 0.1 || l > 0.9; // very unsaturated, very dark, or very light
}

/** Angular distance between two hues (0-180°) */
function hueDist(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return d > 180 ? 360 - d : d;
}

export type ColorStory =
  | "Monochrome"
  | "Complementary"
  | "Analogous"
  | "Triadic"
  | "Neutral Palette"
  | "Neutral Base"
  | "Mixed";

/**
 * Score color compatibility between two hex colors.
 * Returns { score: 0-1, story: ColorStory }
 */
export function pairHarmony(hex1: string, hex2: string): { score: number; story: ColorStory } {
  if (!hex1 || !hex2) return { score: 0.6, story: "Mixed" };

  const hsl1 = hexToHsl(hex1);
  const hsl2 = hexToHsl(hex2);
  const n1 = isNeutral(hsl1), n2 = isNeutral(hsl2);

  if (n1 && n2) return { score: 0.85, story: "Neutral Palette" };
  if (n1 || n2) return { score: 0.80, story: "Neutral Base" };

  const dist = hueDist(hsl1[0], hsl2[0]);

  if (dist < 20)  return { score: 1.00, story: "Monochrome" };
  if (dist < 45)  return { score: 0.85, story: "Analogous" };
  if (dist < 90)  return { score: 0.65, story: "Mixed" };
  if (dist < 150) return { score: 0.70, story: "Triadic" };
  return             { score: 0.90, story: "Complementary" }; // 150-180°
}

/**
 * Score color harmony across an entire outfit (array of hex colors).
 * Returns { score: 0-1, story: string label }
 */
export function outfitColorScore(hexColors: (string | null | undefined)[]): {
  score: number;
  story: ColorStory;
} {
  const valid = hexColors.filter(Boolean) as string[];
  if (valid.length === 0) return { score: 0.5, story: "Mixed" };
  if (valid.length === 1) return { score: 0.8, story: "Neutral Base" };

  const pairs: { score: number; story: ColorStory }[] = [];
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      pairs.push(pairHarmony(valid[i], valid[j]));
    }
  }

  const avgScore = pairs.reduce((s, p) => s + p.score, 0) / pairs.length;

  // Pick the most representative story (most common)
  const storyCounts = new Map<ColorStory, number>();
  for (const p of pairs) storyCounts.set(p.story, (storyCounts.get(p.story) ?? 0) + 1);
  const topStory = [...storyCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  return { score: avgScore, story: topStory };
}

/** Score how well occasions match across an outfit (0-1) */
export function occasionScore(occasions: (string | null | undefined)[]): number {
  const valid = occasions.filter(Boolean) as string[];
  if (valid.length === 0) return 0.5;
  const counts = new Map<string, number>();
  valid.forEach((o) => counts.set(o, (counts.get(o) ?? 0) + 1));
  const max = Math.max(...counts.values());
  return max / valid.length; // 1.0 if all same, 0.5 if half match, etc.
}

/** Score how well seasons match (0-1) */
export function seasonScore(seasons: (string | null | undefined)[]): number {
  const valid = seasons.filter(Boolean) as string[];
  if (valid.length === 0) return 0.5;
  const counts = new Map<string, number>();
  valid.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
  const max = Math.max(...counts.values());
  return max / valid.length;
}

/** Score style era compatibility (0-1) */
export function styleEraScore(eras: (string | null | undefined)[]): number {
  const valid = eras.filter(Boolean) as string[];
  if (valid.length === 0) return 0.5;

  // Compatible era groupings
  const compatGroups = [
    new Set(["minimalist", "contemporary", "dark academia"]),
    new Set(["streetwear", "athleisure", "Y2K"]),
    new Set(["bohemian", "cottagecore", "vintage 90s"]),
    new Set(["traditional Indian", "Ethnicwear"]),
    new Set(["minimalist", "athleisure", "contemporary"]),
  ];

  const counts = new Map<string, number>();
  valid.forEach((e) => counts.set(e, (counts.get(e) ?? 0) + 1));
  const dominantEra = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Check if all items fall within a compatible group
  for (const group of compatGroups) {
    if (group.has(dominantEra) && valid.every((e) => group.has(e))) {
      return 1.0;
    }
  }

  const maxCount = Math.max(...counts.values());
  return 0.5 + (maxCount / valid.length) * 0.5; // 0.5–1.0
}

/** Pattern clash penalty: too many busy patterns reduce score */
export function patternPenalty(patterns: (string | null | undefined)[]): number {
  const valid = patterns.filter(Boolean) as string[];
  const busyPatterns = valid.filter((p) => p !== "solid" && p !== "");
  if (busyPatterns.length <= 1) return 0;   // fine
  if (busyPatterns.length === 2) return 0.1; // slight clash
  return 0.25; // three patterned items = noisy
}

/**
 * Master outfit scorer. Returns a 0-100 score and labeled reasons.
 *
 * Weights:
 *   Color harmony   35%  — HSL-based color theory (was 40%)
 *   Trend alignment 20%  — 2025 micro-trend trendiness (NEW)
 *   Occasion match  20%  — all items fit same occasion (was 25%)
 *   Season fit      15%  — all items fit same season (was 20%)
 *   Style era       10%  — compatible aesthetic groupings (was 15%)
 */
export function scoreOutfit(items: {
  dominantColorHex?: string | null;
  occasion?: string | null;
  season?: string | null;
  styleEra?: string | null;
  pattern?: string | null;
  microTrend?: string | null;   // NEW — 2025 micro-trend label from CLIP classifier
}[]): { score: number; reasons: string[]; colorStory: ColorStory; dominantTrend?: string } {
  const colors     = items.map((i) => i.dominantColorHex);
  const occasions  = items.map((i) => i.occasion);
  const seasons    = items.map((i) => i.season);
  const eras       = items.map((i) => i.styleEra);
  const patterns   = items.map((i) => i.pattern);
  const trends     = items.map((i) => i.microTrend);

  const { score: colorSc, story } = outfitColorScore(colors);
  const occasionSc  = occasionScore(occasions);
  const seasonSc    = seasonScore(seasons);
  const eraSc       = styleEraScore(eras);
  const penalty     = patternPenalty(patterns);
  const { score: trendSc, dominantTrend } = outfitTrendScore(trends);

  // Weighted sum (all individual scores are 0-1, weights sum to 100)
  const raw =
    colorSc    * 35 +
    trendSc    * 20 +
    occasionSc * 20 +
    seasonSc   * 15 +
    eraSc      * 10;

  const final = Math.round(Math.max(0, raw - penalty * 100));

  const reasons: string[] = [];
  if (colorSc >= 0.85)    reasons.push(`${story} color palette`);
  else if (colorSc >= 0.7) reasons.push("Compatible color tones");
  if (trendSc >= 0.90)    reasons.push(`On-trend: ${dominantTrend}`);
  else if (trendSc >= 0.80) reasons.push(`Trend-forward: ${dominantTrend}`);
  if (occasionSc >= 0.9)  reasons.push("Perfect occasion match");
  if (seasonSc >= 0.9)    reasons.push("Season-appropriate pieces");
  if (eraSc >= 0.9)       reasons.push("Cohesive style aesthetic");
  if (penalty > 0)        reasons.push("Tip: reduce pattern mixing");
  if (reasons.length === 0) reasons.push("Balanced combination");

  return { score: Math.min(100, final), reasons, colorStory: story, dominantTrend };
}
