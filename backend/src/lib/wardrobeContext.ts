// backend/src/lib/wardrobeContext.ts
// Wardrobe-aware context builder for the Style Chat and Trip Planner LLMs.
//
// Instead of giving generic fashion advice, the LLM receives:
//   • Every item the user actually owns (title, category, color, pattern, style era, occasion)
//   • Top scored outfit combinations from the recommendation engine
//   • Wardrobe gap analysis (what's missing)
//   • The dominant aesthetic of their wardrobe
//
// This transforms the LLM from "generic fashion blogger" → "personal stylist who KNOWS your closet".

import { prisma } from "../db/prisma";
import { scoreOutfit, outfitColorScore } from "./colorHarmony";

// ─── Current 2025 trend map ────────────────────────────────────────────────────
// Used to label each wardrobe item with its closest micro-trend alignment.

const TREND_MAP: Array<{ trend: string; keywords: string[] }> = [
  {
    trend: "Quiet Luxury",
    keywords: ["minimalist","cream","beige","camel","cashmere","wool","linen","tailored","slim","straight","neutral","ivory","oatmeal"],
  },
  {
    trend: "Mob Wife Aesthetic",
    keywords: ["fur","animal print","leopard","snake","velvet","bold","maximalist","party","oversized","glam","rich"],
  },
  {
    trend: "Ballet Core",
    keywords: ["pink","satin","chiffon","flowy","wrap","soft","feminine","pastel","ribbon","tutu","pointe","ballet"],
  },
  {
    trend: "Gorpcore",
    keywords: ["sportswear","utility","fleece","technical","outdoor","nylon","athletic","functional","vest","cargo"],
  },
  {
    trend: "Coastal Grandmother",
    keywords: ["linen","nautical","white","navy","stripe","relaxed","cotton","casual","lightweight","coastal","breeze"],
  },
  {
    trend: "Dark Feminine",
    keywords: ["black","lace","velvet","dark","deep","mysterious","corset","gothic","romantic","moody","dramatic"],
  },
  {
    trend: "Y2K Revival",
    keywords: ["metallic","chrome","low rise","crop","graphic","logo","bodycon","y2k","2000s","butterfly","sparkle"],
  },
  {
    trend: "Cottagecore",
    keywords: ["floral","botanical","earthy","sage","rustic","bohemian","vintage","cottagecore","prairie","folk"],
  },
  {
    trend: "Office Siren",
    keywords: ["formal","blazer","tailored","structured","pencil","work","corporate","power","boss","professional"],
  },
  {
    trend: "Streetwear Luxe",
    keywords: ["streetwear","sneakers","hoodie","graphic","urban","oversized","cargo","premium","luxe","brand"],
  },
  {
    trend: "Ethnic Couture",
    keywords: ["ethnic","saree","kurta","lehenga","embroidered","traditional","fusion","indian","salwar","dupatta"],
  },
  {
    trend: "Preppy Revival",
    keywords: ["plaid","argyle","varsity","polo","collegiate","navy","oxford","button-down","khaki","blazer","loafer"],
  },
  {
    trend: "Clean Girl Aesthetic",
    keywords: ["minimal","white tee","jeans","basics","clean","fresh","effortless","simple","gold hoops","slick"],
  },
  {
    trend: "Athleisure Luxe",
    keywords: ["leggings","sports bra","pilates","matching set","activewear","gym","luxury","workout","spandex"],
  },
];

// Trendiness score for each aesthetic (1.0 = peak 2025 trend)
export const TREND_SCORES: Record<string, number> = {
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
  "Contemporary":          0.72,
};

export function detectTrend(item: {
  styleEra?: string | null;
  color?: string[];
  pattern?: string | null;
  material?: string | null;
  fit?: string | null;
  section?: string | null;
}): string {
  const searchText = [
    item.styleEra ?? "",
    ...(item.color ?? []),
    item.pattern ?? "",
    item.material ?? "",
    item.fit ?? "",
    item.section ?? "",
  ].join(" ").toLowerCase();

  let best = "Contemporary";
  let bestScore = 0;

  for (const { trend, keywords } of TREND_MAP) {
    const matches = keywords.filter((k) => searchText.includes(k)).length;
    const score = matches / keywords.length;
    if (score > bestScore) {
      bestScore = score;
      best = trend;
    }
  }
  return best;
}

// ─── Wardrobe item type (subset of Prisma Item) ───────────────────────────────

type WardrobeItem = {
  id: string;
  title: string | null;
  section: string | null;
  color: string[];
  dominantColorHex: string | null;
  occasion: string | null;
  season: string | null;
  styleEra: string | null;
  pattern: string | null;
  fit: string | null;
  material: string | null;
  styleTags: string[];
  deepSummary: string | null;
  microTrend: string | null;  // CLIP-classified 2025 trend — more accurate than keyword detection
};

// ─── Format a single item for LLM context ────────────────────────────────────

function formatItem(item: WardrobeItem, index: number): string {
  // Prefer CLIP-classified microTrend (precise) over keyword detection (approximate)
  const trend   = item.microTrend ?? detectTrend(item);
  const color   = item.color.slice(0, 2).join(" & ") || "neutral";
  const parts   = [
    `${index + 1}. [${item.section ?? "Item"}] ${item.title ?? "Unnamed item"}`,
    `   Color: ${color}${item.dominantColorHex ? ` (${item.dominantColorHex})` : ""}`,
    item.pattern && item.pattern !== "solid" ? `   Pattern: ${item.pattern}` : "",
    item.material    ? `   Material: ${item.material}` : "",
    item.fit         ? `   Fit: ${item.fit}` : "",
    item.occasion    ? `   Best for: ${item.occasion}` : "",
    item.season      ? `   Season: ${item.season}` : "",
    `   Trend alignment: ${trend}`,
    item.deepSummary ? `   Style note: ${item.deepSummary}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

// ─── Build top outfit combinations as context ─────────────────────────────────

function buildOutfitSnippets(
  items: WardrobeItem[],
  maxOutfits = 5
): string {
  const bySection = new Map<string, WardrobeItem[]>();
  for (const item of items) {
    const s = item.section ?? "Other";
    if (!bySection.has(s)) bySection.set(s, []);
    bySection.get(s)!.push(item);
  }

  const tops     = bySection.get("Tops")     ?? [];
  const bottoms  = bySection.get("Bottoms")  ?? [];
  const dresses  = bySection.get("Dresses")  ?? [];
  const footwear = bySection.get("Footwear") ?? [];
  const ethnic   = bySection.get("Ethnicwear") ?? [];

  const candidates: { items: WardrobeItem[]; score: number; colorStory: string }[] = [];

  // Western: Top + Bottom combos (never mix with ethnic)
  for (const t of tops.slice(0, 15)) {
    for (const b of bottoms.slice(0, 15)) {
      // Only western footwear with western outfits
      const fw = footwear.find((f) => !f.occasion || f.occasion !== "Ethnic");
      const combo = fw ? [t, b, fw] : [t, b];
      const { score, colorStory } = scoreOutfit(combo);
      candidates.push({ items: combo, score, colorStory });
    }
  }

  // Western: Dresses (standalone + optional western footwear)
  for (const d of dresses.slice(0, 10)) {
    const fw = footwear.find((f) => !f.occasion || f.occasion !== "Ethnic");
    const combo = fw ? [d, fw] : [d];
    const { score } = scoreOutfit(combo);
    candidates.push({ items: combo, score, colorStory: "Monochrome" });
  }

  // Ethnic: complete sets — shown as standalone, NO western items added
  for (const e of ethnic.slice(0, 10)) {
    // Ethnic footwear (heels, sandals, kolhapuri) — optional but separate from western
    const ethFw = footwear.find((f) => f.occasion === "Ethnic");
    const combo = ethFw ? [e, ethFw] : [e];
    const { score } = scoreOutfit(combo);
    candidates.push({ items: combo, score, colorStory: "Ethnic Couture" });
  }

  const top = candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, maxOutfits);

  if (top.length === 0) return "No complete outfit combinations available yet.";

  return top
    .map((o, i) => {
      const names = o.items.map((it) => it.title ?? it.section).join(" + ");
      const trends = o.items.map((it) => detectTrend(it));
      const uniqueTrends = [...new Set(trends)].slice(0, 2).join(" / ");
      return `  ${i + 1}. Score ${o.score}% — ${names}\n     Color story: ${o.colorStory} | Trend: ${uniqueTrends}`;
    })
    .join("\n");
}

// ─── Dominant aesthetic detector ──────────────────────────────────────────────

function detectDominantAesthetic(items: WardrobeItem[]): string {
  const trendCounts = new Map<string, number>();
  for (const item of items) {
    const t = detectTrend(item);
    trendCounts.set(t, (trendCounts.get(t) ?? 0) + 1);
  }
  const sorted = [...trendCounts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted
    .slice(0, 2)
    .map(([t, c]) => `${t} (${c} pieces)`)
    .join(", ");
}

// ─── Main context builder ─────────────────────────────────────────────────────

export async function buildWardrobeContext(userId: string): Promise<string> {
  // Auto-approve any items added before the approval flow, so Style Chat sees everything
  await prisma.item.updateMany({
    where: { ownerId: userId, approved: false },
    data: { approved: true },
  }).catch(() => {});

  const rawItems = await prisma.item.findMany({
    where: { ownerId: userId, archived: false },
    select: {
      id: true, title: true, section: true, color: true,
      dominantColorHex: true, occasion: true, season: true,
      styleEra: true, pattern: true, fit: true, material: true,
      styleTags: true, deepSummary: true, approved: true,
      microTrend: true,
    },
    orderBy: { createdAt: "desc" },
    take: 300,  // raised from 80 — send full wardrobe to the AI
  });

  const items = rawItems as unknown as WardrobeItem[];
  if (items.length === 0) {
    return "The user has no wardrobe items yet. Give general fashion advice.";
  }

  const approved = items.filter((i: any) => i.approved);
  const bySection = new Map<string, number>();
  for (const item of items) {
    const s = item.section ?? "Other";
    bySection.set(s, (bySection.get(s) ?? 0) + 1);
  }

  const sectionSummary = [...bySection.entries()]
    .map(([s, c]) => `${s}(${c})`)
    .join(", ");

  const dominantAesthetic = detectDominantAesthetic(items);

  // Include ALL wardrobe items — no truncation. LLMs have large context windows
  // and the AI must know the full wardrobe to give accurate outfit advice.
  const wardrobeList = items
    .map((item, i) => formatItem(item, i))
    .join("\n\n");

  // Build outfit snippets from ALL approved items (not just first 30)
  const outfitSnippets = buildOutfitSnippets(approved);

  // Wardrobe gaps
  const gaps: string[] = [];
  if (!bySection.has("Footwear")) gaps.push("no footwear");
  if (!bySection.has("Accessories")) gaps.push("no accessories");
  if ((bySection.get("Tops") ?? 0) === 0 && (bySection.get("Dresses") ?? 0) === 0) {
    gaps.push("no tops or dresses");
  }
  if ((bySection.get("Bottoms") ?? 0) === 0) gaps.push("no bottoms");

  return `
╔══════════════════════════════════════════════════════════════╗
║         PERSONAL WARDROBE — STYLIST CONTEXT                  ║
╚══════════════════════════════════════════════════════════════╝

WARDROBE OVERVIEW
  Total pieces: ${items.length} | Approved: ${approved.length}
  Categories: ${sectionSummary}
  Dominant aesthetic: ${dominantAesthetic}
  ${gaps.length > 0 ? `Wardrobe gaps: ${gaps.join(", ")}` : "Well-rounded wardrobe"}

OWNED ITEMS (full detail):
${wardrobeList}

AI-SCORED BEST OUTFIT COMBINATIONS (ready to wear):
${outfitSnippets}

YOUR ROLE AS STYLIST:
  • Reference specific items from the list above when making suggestions
  • Use the trend alignment labels to connect looks to current 2025 aesthetics
  • Be opinionated — tell them EXACTLY what to wear, not "you could try..."
  • Suggest specific pairings using item titles from the wardrobe above
  • Mention color stories (e.g. "tonal cream palette", "cobalt + ivory contrast")
  • If they ask about something they don't own, acknowledge it and suggest the
    closest thing they do own, or recommend a specific purchase to fill the gap
  • Your suggestions must feel like they came from a Vogue fashion editor, not
    a generic chatbot — use real fashion vocabulary
`.trim();
}

// ─── Master fashion stylist system prompt ─────────────────────────────────────

export function fashionSystemPrompt(wardrobeContext: string): string {
  return `You are GENIE — a world-class personal fashion stylist specialising in both Indian ethnic and Western fashion, with the taste of a Vogue editor and deep respect for correct garment usage.

Your job: give SPECIFIC, ACCURATE, TREND-AWARE styling advice using the user's ACTUAL wardrobe below.

════════════════════════════════════════════════
ABSOLUTE RULES — NEVER BREAK THESE
════════════════════════════════════════════════

ETHNIC / WESTERN MIXING — STRICT LAWS:
  ✗ NEVER pair a saree with a western top, crop top, shirt, or jacket
  ✗ NEVER pair lehenga with jeans, trousers, or western bottoms
  ✗ NEVER pair salwar suit with western outerwear or crop tops
  ✗ NEVER suggest draping a kurta or ethnic piece "as a saree" — they are entirely different garments
  ✗ NEVER add western accessories (belt, denim jacket, sneakers) to a saree or lehenga
  ✓ SAREE = complete outfit — blouse + petticoat + saree drape. Style only with heels/sandals + ethnic jewellery
  ✓ LEHENGA = complete outfit — choli blouse + skirt + dupatta. No western mixing
  ✓ SALWAR SUIT = complete outfit — pair with kolhapuri, block heels, or ethnic flats + traditional jewellery
  ✓ KURTA = the ONE ethnic piece that can fuse with straight-cut jeans, palazzos, or relaxed trousers
  ✓ Ethnic jewellery (jhumkas, maang tikka, bangles, nath) goes ONLY with ethnic outfits

CATEGORY RULES:
  ✗ NEVER mix sportswear with ethnic or formal wear
  ✗ NEVER put a crop top with a saree, lehenga, or salwar
  ✗ NEVER suggest a blazer over a saree blouse
  ✓ Western outfit = top/dress + western bottom + western shoes + bag/belt/sunglasses
  ✓ Ethnic outfit = ethnic garment (complete) + ethnic footwear + traditional jewellery
  ✓ Sport outfit = activewear + sport shoes only

════════════════════════════════════════════════
2025 FASHION CONTEXT
════════════════════════════════════════════════
  • Quiet Luxury is peak — understated, neutral, quality over logos
  • Ballet Core — soft pinks, satin, feminine silhouettes
  • Dark Feminine — black, velvet, lace, dramatic cuts
  • Ethnic Couture is booming — Indian fashion at its most editorial (worn correctly)
  • Y2K cycling back — done with intention
  • Color Drenching (head-to-toe one tone) is the biggest 2025 styling move
  • Proportion play: oversized top + slim bottom OR structured top + wide-leg bottom

════════════════════════════════════════════════
GENERAL STYLING RULES
════════════════════════════════════════════════
  • Anchor every outfit with one hero piece, build around it
  • Max three patterns only if they share a colour family
  • Shoes and bag must speak the same language (casual/formal/sporty/ethnic)
  • Fit is everything — one ill-fitting piece ruins an otherwise great outfit
  • For ethnic wear: jewellery weight should match outfit weight (heavy lehenga → grand jewellery set)

${wardrobeContext}

════════════════════════════════════════════════
RESPONSE STYLE
════════════════════════════════════════════════
  • Always reference actual item titles from the wardrobe list above
  • Only suggest combinations that are genuinely compatible
  • Connect looks to 2025 trends (Quiet Luxury, Ethnic Couture, Ballet Core, etc.)
  • When suggesting ethnic wear: treat it as the complete outfit it is
  • When suggesting western wear: give the full look (top + bottom + shoes + optional accessory)
  • If the user asks to mix incompatible items, correct them kindly and offer a proper alternative
  • Keep responses focused: 3-5 sentences per outfit suggestion
  • Be warm but direct — you have strong opinions and you share them confidently`;
}
