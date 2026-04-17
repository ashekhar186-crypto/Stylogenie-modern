"use strict";
// backend/src/routes/recommend.ts
// AI Outfit Recommendation Engine — rebuilt with strict fashion compatibility rules.
//
// Core rules:
//  1. ETHNIC and WESTERN clothes NEVER mix in the same outfit
//  2. Complete ethnic sets (saree, lehenga, salwar suit) are standalone outfits
//  3. Kurta is the only ethnic item that may fuse with western bottoms
//  4. Sportswear stays in its own category — never mixes with formal/ethnic
//  5. Groq-powered trend analysis scores outfits by 2025 micro-trend alignment
//  6. Tier-shuffled final sort ensures fresh suggestions every load
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../db/prisma");
const colorHarmony_1 = require("../lib/colorHarmony");
const wardrobeContext_1 = require("../lib/wardrobeContext");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
function detectEthnicType(item) {
    const text = [
        item.title ?? "",
        item.deepSummary ?? "",
        ...(item.styleTags ?? []),
    ].join(" ").toLowerCase();
    if (/saree|sari|drape|pallu|blouse/.test(text))
        return "saree";
    if (/lehenga|ghagra|chaniya/.test(text))
        return "lehenga";
    if (/salwar|churidar|suit|sharara|palazzo/.test(text))
        return "salwar-suit";
    if (/kurta|kurti|tunic/.test(text))
        return "kurta";
    return "other-ethnic";
}
// Can this ethnic item mix with western bottoms? Only kurtas.
function canFuseWithWestern(item) {
    return detectEthnicType(item) === "kurta";
}
// Is this a complete standalone ethnic outfit (no mixing allowed)?
function isCompleteEthnicSet(item) {
    const type = detectEthnicType(item);
    return type === "saree" || type === "lehenga" || type === "salwar-suit";
}
// ─── Fashion-editor outfit narratives ─────────────────────────────────────────
const TREND_NARRATIVES = {
    "Quiet Luxury": [
        "Understated mastery — tonal, polished, effortlessly expensive.",
        "Old money energy in every thread. This is Quiet Luxury at its most wearable.",
        "Minimalist precision that speaks louder than any logo ever could.",
    ],
    "Ballet Core": [
        "Soft, graceful, utterly feminine — this outfit moves like a ballet sequence.",
        "Delicate silhouettes with serious style credentials. Ballet Core perfected.",
        "Ethereal layers and gentle tones that belong in a studio — and on the street.",
    ],
    "Office Siren": [
        "Commanding in the boardroom, magnetic everywhere else. Structure never looked this good.",
        "Power-dressing 2025: sharp lines, intentional cuts, zero room for doubt.",
        "This outfit announces your presence before you say a word.",
    ],
    "Dark Feminine": [
        "Mysterious, deliberate, entirely magnetic. Dark Feminine dressed to perfection.",
        "Rich textures, deep tones — this outfit wraps you in confident darkness.",
        "Gothic romance meets modern precision. Fashion with a serious edge.",
    ],
    "Y2K Revival": [
        "Nostalgia filter on. This combination brings 2000s energy into 2025 without apology.",
        "Playful, bold, maximalist — and completely intentional. Y2K done with real taste.",
        "The throwback that actually works. Proportions, attitude, and personality.",
    ],
    "Streetwear Luxe": [
        "Urban cool meets premium finish. Ease and edge in perfect balance.",
        "Effortlessly expensive casual — the kind of look you see outside Fashion Week.",
        "Street credibility with Michelin-star execution.",
    ],
    "Ethnic Couture": [
        "Heritage and modernity in perfect balance. Artisanal dressing at its finest.",
        "Cultural richness, editorial precision — this outfit belongs on a runway.",
        "A celebration of craft and tradition, worn with absolute contemporary confidence.",
    ],
    "Cottagecore": [
        "Soft, pastoral, utterly poetic — like a Vogue shoot on a sunlit afternoon.",
        "Botanical warmth in romantic layers. Cottagecore for the fashion-literate.",
        "Dreamy, considered, completely your own world.",
    ],
    "Clean Girl Aesthetic": [
        "Effortless, minimal, quietly aspirational. Clean Girl, elevated.",
        "The 'I woke up like this' formula — if you happened to have incredible taste.",
        "Less is infinite here. Pristine basics, perfect proportion.",
    ],
    "Preppy Revival": [
        "Collegiate confidence with a 2025 edge. Prep culture done with real conviction.",
        "Classic structure, modern attitude — preppy remixed for right now.",
        "Old school tailored charm with absolutely no intention of going anywhere.",
    ],
    "Gorpcore": [
        "Technical utility meets unexpected editorial. Function is the new fashion.",
        "Trails-ready and trend-approved — this outfit works harder than most.",
        "Outdoor-inspired dressing with genuine style intelligence.",
    ],
    "Coastal Grandmother": [
        "Breezy, refined, sun-kissed with zero effort. Coastal, perfectly edited.",
        "Linen, light, and luminous — this outfit belongs somewhere beautiful.",
        "Relaxed luxury that never feels casual about itself.",
    ],
    "Mob Wife Aesthetic": [
        "Commitment to maximalism, executed with conviction. Bold, glam, unforgettable.",
        "This outfit makes a statement before you enter the room.",
        "More is more — and this outfit wears that philosophy brilliantly.",
    ],
    "Athleisure Luxe": [
        "Premium activewear energy that works far beyond the studio.",
        "Curated, coordinated, quietly aspirational. Athleisure with actual taste.",
        "High-performance dressing that also happens to be beautiful.",
    ],
    "Contemporary": [
        "Modern, versatile, confidently put-together. A wardrobe workhorse, elevated.",
        "Clean cuts and smart proportions — the backbone of any great wardrobe.",
        "Understated but entirely deliberate. Wear it anywhere.",
    ],
};
function getOutfitNarrative(dominantTrend, outfitId) {
    const options = TREND_NARRATIVES[dominantTrend] ?? TREND_NARRATIVES["Contemporary"];
    const idx = parseInt(outfitId.slice(0, 4), 16) % options.length;
    return options[idx];
}
function resolveItemTrend(item) {
    if (item.microTrend)
        return item.microTrend;
    return (0, wardrobeContext_1.detectTrend)(item);
}
// ─── Helpers ──────────────────────────────────────────────────────────────────
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function outfitId(items) {
    const key = items.map((i) => i.id).sort().join("|");
    return (0, crypto_1.createHash)("md5").update(key).digest("hex").slice(0, 12);
}
function dominantOccasion(items) {
    const counts = new Map();
    items.forEach((i) => {
        if (i.occasion)
            counts.set(i.occasion, (counts.get(i.occasion) ?? 0) + 1);
    });
    if (counts.size === 0)
        return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
function dominantSeason(items) {
    const counts = new Map();
    items.forEach((i) => {
        if (i.season)
            counts.set(i.season, (counts.get(i.season) ?? 0) + 1);
    });
    if (counts.size === 0)
        return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
// Pick the best-matching optional item for this core outfit (occasion + random)
function pickOptional(pool, coreOccasion) {
    if (pool.length === 0)
        return null;
    const matched = coreOccasion
        ? pool.filter((i) => !i.occasion || i.occasion === coreOccasion)
        : pool;
    const candidates = matched.length > 0 ? matched : pool;
    return pickRandom(candidates);
}
// ─── Strict Outfit Generator ───────────────────────────────────────────────────
// Enforces category compatibility rules — no ethnic/western mixing.
function generateOutfits(groups, filters) {
    const outfits = [];
    const get = (section) => {
        const all = groups.get(section) ?? [];
        if (!filters.occasion)
            return all;
        // Prefer occasion-matched items, fall back to all if none match
        const matched = all.filter((i) => !i.occasion || i.occasion === filters.occasion);
        return matched.length > 0 ? matched : all;
    };
    // Shuffle everything fresh every request
    const tops = shuffle(get("Tops"));
    const bottoms = shuffle(get("Bottoms"));
    const dresses = shuffle(get("Dresses"));
    const outerwear = shuffle(get("Outerwear"));
    const footwear = shuffle(get("Footwear"));
    const accessories = shuffle(get("Accessories"));
    const ethnic = shuffle(get("Ethnicwear"));
    const sport = shuffle(get("Sportswear"));
    // ── WESTERN: Top + Bottom ─────────────────────────────────────────────────
    // Crop tops, blouses, tees, shirts pair with jeans, skirts, trousers.
    // Never add ethnic accessories or ethnic footwear here.
    let western = 0;
    outer: for (const top of tops.slice(0, 20)) {
        for (const bottom of bottoms.slice(0, 20)) {
            if (western++ >= 40)
                break outer;
            const outfit = [top, bottom];
            const occ = dominantOccasion(outfit);
            const ow = pickOptional(outerwear, occ);
            const fw = pickOptional(footwear, occ);
            const acc = pickOptional(accessories, occ);
            if (ow)
                outfit.push(ow);
            if (fw)
                outfit.push(fw);
            if (acc)
                outfit.push(acc);
            outfits.push(outfit);
        }
    }
    // ── WESTERN: Dress ────────────────────────────────────────────────────────
    // Dresses are standalone. Optionally layer outerwear/footwear/accessories.
    for (const dress of dresses.slice(0, 15)) {
        // Generate up to 3 variations per dress with different optional combos
        const reps = Math.min(3, Math.max(1, footwear.length || 1));
        for (let r = 0; r < reps; r++) {
            const outfit = [dress];
            const occ = dress.occasion;
            // Rotate pools per rep so each variation gets different optional items
            const fwPool = [...footwear.slice(r), ...footwear.slice(0, r)];
            const accPool = [...accessories.slice(r), ...accessories.slice(0, r)];
            const owPool = [...outerwear.slice(r), ...outerwear.slice(0, r)];
            const ow = pickOptional(owPool, occ);
            const fw = pickOptional(fwPool, occ);
            const acc = pickOptional(accPool, occ);
            if (ow)
                outfit.push(ow);
            if (fw)
                outfit.push(fw);
            if (acc)
                outfit.push(acc);
            outfits.push(outfit);
        }
    }
    // ── ETHNIC: Complete Sets (Saree, Lehenga, Salwar Suit) ──────────────────
    // These are full outfits. Only pair with ethnic footwear (sandals/heels)
    // and accessories (jewellery). NEVER with western tops, bottoms, or outerwear.
    for (const eth of ethnic.filter(isCompleteEthnicSet).slice(0, 15)) {
        const outfit = [eth];
        const fw = pickOptional(footwear, eth.occasion);
        const acc = pickOptional(accessories, eth.occasion);
        if (fw)
            outfit.push(fw);
        if (acc)
            outfit.push(acc);
        outfits.push(outfit);
    }
    // ── ETHNIC: Kurta (Fusion-safe) ───────────────────────────────────────────
    // Kurtas can pair with western bottoms (jeans, palazzo, straight-cut trousers).
    // Still no western outerwear — a dupatta or shawl would be added as accessory.
    const kurtas = ethnic.filter(canFuseWithWestern).slice(0, 10);
    for (const kurta of kurtas) {
        // Option 1: Kurta alone (with footwear + accessories)
        const solo = [kurta];
        const fw1 = pickOptional(footwear, kurta.occasion);
        const acc1 = pickOptional(accessories, kurta.occasion);
        if (fw1)
            solo.push(fw1);
        if (acc1)
            solo.push(acc1);
        outfits.push(solo);
        // Option 2: Kurta + western bottom (fusion)
        const fusionBottoms = bottoms.filter((b) => !b.fit || ["straight cut", "relaxed", "regular fit", "slim fit"].includes(b.fit ?? ""));
        const bottom = fusionBottoms[Math.floor(Math.random() * fusionBottoms.length)];
        if (bottom) {
            const fusion = [kurta, bottom];
            const fw2 = pickOptional(footwear, kurta.occasion);
            const acc2 = pickOptional(accessories, kurta.occasion);
            if (fw2)
                fusion.push(fw2);
            if (acc2)
                fusion.push(acc2);
            outfits.push(fusion);
        }
    }
    // ── SPORT: Sportswear ─────────────────────────────────────────────────────
    // Activewear + sporty footwear only. Never mixed with formal or ethnic.
    for (const sp of sport.slice(0, 15)) {
        const outfit = [sp];
        // Only add sport/casual footwear
        const sportFw = footwear.filter((f) => !f.occasion || ["Sports", "Casual"].includes(f.occasion ?? ""));
        const fw = pickOptional(sportFw.length > 0 ? sportFw : footwear, sp.occasion);
        if (fw)
            outfit.push(fw);
        outfits.push(outfit);
    }
    return outfits;
}
// ─── Outfit type label ────────────────────────────────────────────────────────
function getOutfitType(items) {
    const sections = new Set(items.map((i) => i.section));
    if (sections.has("Ethnicwear")) {
        if (items.some((i) => i.section !== "Ethnicwear" && i.section !== "Footwear" && i.section !== "Accessories")) {
            return "Fusion";
        }
        return "Ethnic";
    }
    if (sections.has("Sportswear"))
        return "Sport";
    if (sections.has("Dresses"))
        return "Western";
    return "Western";
}
// ─── Score an outfit ──────────────────────────────────────────────────────────
function scoreOutfitFull(combo) {
    const enriched = combo.map((item) => ({
        ...item,
        microTrend: resolveItemTrend(item),
    }));
    const { score, reasons, colorStory, dominantTrend } = (0, colorHarmony_1.scoreOutfit)(enriched);
    const trendValues = enriched.map((i) => (0, colorHarmony_1.trendScore)(i.microTrend));
    const avgTrendiness = trendValues.reduce((s, v) => s + v, 0) / trendValues.length;
    const id = outfitId(combo);
    const trend = dominantTrend ?? "Contemporary";
    return {
        id,
        items: combo,
        score,
        colorStory,
        reasons,
        occasion: dominantOccasion(combo),
        season: dominantSeason(combo),
        dominantTrend: trend,
        trendiness: Math.round(avgTrendiness * 100) / 100,
        narrative: getOutfitNarrative(trend, id),
        outfitType: getOutfitType(combo),
    };
}
// ─── Route: GET /recommend ─────────────────────────────────────────────────────
router.get("/", auth_1.requireAuth, async (req, res) => {
    const userId = req.auth.sub;
    const occasion = req.query.occasion;
    const season = req.query.season;
    const limit = Math.min(parseInt(String(req.query.limit ?? "8"), 10), 20);
    // 1. Fetch wardrobe
    const rawItems = await prisma_1.prisma.item.findMany({
        where: {
            ownerId: userId,
            approved: true,
            archived: false,
            section: { not: null },
        },
        select: {
            id: true, imageUrl: true, title: true, section: true,
            color: true, dominantColorHex: true, occasion: true, season: true,
            styleEra: true, pattern: true, fit: true, material: true,
            styleTags: true, microTrend: true, deepSummary: true,
        },
        orderBy: { createdAt: "desc" },
        take: 200,
    });
    if (rawItems.length < 2) {
        return res.json({
            outfits: [],
            message: "Add at least 2 approved wardrobe items to get outfit suggestions.",
        });
    }
    const items = rawItems;
    // 2. Group by section
    const groups = new Map();
    for (const item of items) {
        const sec = item.section ?? "Other";
        if (!groups.has(sec))
            groups.set(sec, []);
        groups.get(sec).push(item);
    }
    // 3. Generate compatible outfit combinations
    const combos = generateOutfits(groups, { occasion, season });
    // 4. Score every combo
    const scored = combos.map(scoreOutfitFull);
    // 5. Tier-based sort with intra-tier shuffle for fresh results every load
    // Outfits within 0.08 of each other are considered same quality → shuffle those
    const TIER = 0.08;
    const seen = new Set();
    const results = scored
        .sort((a, b) => {
        const tierA = Math.floor(a.score / TIER);
        const tierB = Math.floor(b.score / TIER);
        if (tierA !== tierB)
            return tierB - tierA;
        return Math.random() - 0.5; // fresh order within same quality tier
    })
        .filter((o) => {
        if (seen.has(o.id))
            return false;
        seen.add(o.id);
        return true;
    })
        .slice(0, limit);
    return res.json({ outfits: results, total: results.length });
});
// ─── Route: GET /recommend/stats ──────────────────────────────────────────────
router.get("/stats", auth_1.requireAuth, async (req, res) => {
    const userId = req.auth.sub;
    const items = await prisma_1.prisma.item.findMany({
        where: { ownerId: userId, archived: false },
        select: { section: true, occasion: true, season: true, color: true, approved: true },
    });
    const bySection = new Map();
    const byOccasion = new Map();
    const bySeason = new Map();
    for (const item of items) {
        if (item.section)
            bySection.set(item.section, (bySection.get(item.section) ?? 0) + 1);
        if (item.occasion)
            byOccasion.set(item.occasion, (byOccasion.get(item.occasion) ?? 0) + 1);
        if (item.season)
            bySeason.set(item.season, (bySeason.get(item.season) ?? 0) + 1);
    }
    const approved = items.filter((i) => i.approved).length;
    const hasTops = (bySection.get("Tops") ?? 0) > 0;
    const hasBottoms = (bySection.get("Bottoms") ?? 0) > 0;
    const hasDresses = (bySection.get("Dresses") ?? 0) > 0;
    const gaps = [];
    if (!hasTops && !hasDresses)
        gaps.push("Add some tops or dresses");
    if (!hasBottoms && !hasDresses)
        gaps.push("Add bottoms (jeans, skirts, etc.)");
    if ((bySection.get("Footwear") ?? 0) === 0)
        gaps.push("Add footwear for complete outfits");
    return res.json({
        total: items.length,
        approved,
        bySection: Object.fromEntries(bySection),
        byOccasion: Object.fromEntries(byOccasion),
        bySeason: Object.fromEntries(bySeason),
        gaps,
        readyForRecommendations: approved >= 2,
    });
});
exports.default = router;
