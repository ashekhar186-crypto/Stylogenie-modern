// backend/src/routes/describe.ts — v7
// Deep AI fashion classification.
// Vision call order:
//   0. Local CLIP classifier (Python service, port 5001) — ~3-8s, no API, returns JSON directly
//   1. Ollama vision (local LLM — slow on Intel CPU, fast on M-series)
//   2. Gemini Flash (free API, 1500 req/day)
//   3. OpenRouter fallback chain (5 free vision models)
// Extra endpoint: POST /describe/save  — saves pre-computed classification without re-running AI

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prisma";
import { z } from "zod";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import path from "path";

import { orClient } from "../lib/openrouter";

// Feature 21: Image optimization with Sharp (lazy-loaded, graceful degradation)
// Using a lazy loader instead of top-level await to avoid ESM module init issues with tsx.
let _sharp: any = null;
let _sharpChecked = false;
async function getSharp(): Promise<any> {
  if (_sharpChecked) return _sharp;
  _sharpChecked = true;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — sharp is optional; installed separately via npm install sharp
    const mod = await import("sharp");
    _sharp = mod.default ?? mod;
    console.log("[describe] Sharp image optimization: enabled ✓");
  } catch {
    console.warn("[describe] Sharp not installed — storing original. Run: cd backend && npm install sharp");
    _sharp = null;
  }
  return _sharp;
}
import { mapSectionGuess, detectSubType } from "../lib/mapSectionGuess";
import { geminiVision, geminiEnabled } from "../lib/gemini";
import { ollamaVision } from "../lib/ollama";
import { localClassify } from "../lib/localClassifier";
import { isModelHealthy, markModelFailed, markModelHealthy } from "../lib/modelHealth";

const router = Router();

/* ─── upload dir ─────────────────────────────────────────────────────────────
   Must match the static-serving path in server.ts ("/uploads" → cwd/uploads).
   Previously used ".uploads" (hidden folder) which was never publicly served.
─────────────────────────────────────────────────────────────────────────── */
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Images only")),
});

/* ─── OR vision fallback chain ─── */
const VISION_MODELS: string[] = (
  process.env.OPENROUTER_MODEL_VISION_LIST?.trim() ||
  "qwen/qwen-2.5-vl-7b-instruct:free,meta-llama/llama-3.2-11b-vision-instruct:free,mistralai/pixtral-12b:free"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ─── deep classification prompt ─── */
// v8 — comprehensive garment type list, precise color system, human/object detection,
//       Indian ethnic wear fully covered, hex validation, subType field.
const DEEP_CLASSIFY_PROMPT = `You are an elite fashion analyst and textile expert with deep knowledge of both Western fashion and Indian ethnic wear.

════════════════════════════════════
STEP 1 — UNDERSTAND THE IMAGE TYPE
════════════════════════════════════
Identify what kind of image this is and set "imageType" accordingly:
  • "person-wearing"  — A human model or person wearing the garment (standing, sitting, posed)
  • "mannequin"       — Clothing displayed on a store mannequin or dress form
  • "flat-lay"        — Garment photographed flat on a surface
  • "product-photo"   — Clean product/catalog photo, usually on white background
  • "accessory-only"  — Shoes, bags, jewellery, or accessories with no garment

If "person-wearing": Analyze ONLY the PRIMARY clothing item (the most featured/prominent piece). Completely ignore the person's skin, hair, face, hands, and body — they are irrelevant. Focus entirely on the FABRIC and GARMENT.

════════════════════════════════════
STEP 2 — IDENTIFY THE EXACT GARMENT TYPE
════════════════════════════════════
Identify the most specific garment type from these options:

TOPS: t-shirt, shirt, blouse, crop top, tank top, camisole, tube top, halter top, off-shoulder top, one-shoulder top, polo shirt, henley, button-down shirt, linen shirt, peplum top, bustier, corset top, kaftan top, shrug
BOTTOMS: jeans, wide-leg jeans, straight-leg jeans, skinny jeans, cargo pants, trousers, chinos, shorts, mini skirt, midi skirt, maxi skirt, pleated skirt, palazzo pants, leggings, culottes, joggers, sweatpants, track pants, capri pants
DRESSES: mini dress, midi dress, maxi dress, wrap dress, bodycon dress, A-line dress, shift dress, shirt dress, slip dress, sundress, co-ord set, jumpsuit, romper, playsuit, dungarees
OUTERWEAR: blazer, suit jacket, leather jacket, denim jacket, bomber jacket, puffer jacket, windbreaker, trench coat, overcoat, wool coat, hoodie, sweatshirt, cardigan, sweater, pullover, vest, gilet, cape, poncho
FOOTWEAR: sneakers, chunky sneakers, running shoes, heels, block heels, stiletto heels, kitten heels, ankle boots, knee-high boots, loafers, oxfords, sandals, flat sandals, gladiator sandals, flip flops, mules, slides, wedges, platform shoes, ballet flats, espadrilles, kolhapuri chappals, juttis, mojaris
ACCESSORIES: handbag, tote bag, clutch, shoulder bag, crossbody bag, backpack, belt, watch, sunglasses, baseball cap, beanie, beret, scarf, dupatta, stole, shawl, necklace, earrings, bangles, bracelet, ring, maang tikka, nose ring (nath), kamarband, anklet, brooch, hair accessories
ETHNICWEAR: saree (with blouse), lehenga set (choli+skirt+dupatta), salwar suit (kameez+salwar), churidar suit, anarkali suit, sharara set, gharara set, palazzo suit, kurta (long), kurti (short), sherwani, bandhgala jacket, nehru jacket, dhoti kurta, indo-western fusion, ethnic jacket
SPORTSWEAR: sports bra, gym leggings, yoga pants, track suit, jogger set, sports shorts, athletic top, compression tights, cycling shorts, activewear set, jersey

════════════════════════════════════
STEP 3 — PRECISE COLOR ANALYSIS
════════════════════════════════════
Use SPECIFIC color names — never just "red", "blue", "green":
  Red family: crimson, scarlet, brick red, burgundy, wine red, coral red, rust, terracotta, rose red
  Blue family: navy blue, royal blue, cobalt blue, sky blue, powder blue, dusty blue, indigo, teal blue, denim blue
  Green family: olive green, emerald green, sage green, mint green, forest green, hunter green, lime green, khaki green
  Pink family: blush pink, hot pink, dusty rose, mauve, coral pink, baby pink, fuchsia, salmon
  Neutral: ivory, cream, off-white, ecru, oatmeal, camel, tan, beige, sand, stone, taupe, mushroom, warm grey, cool grey, charcoal, jet black
  Other: mustard yellow, golden yellow, burnt orange, lilac, lavender, violet, periwinkle, teal, turquoise, copper, bronze, gold, silver

For "dominantColorHex": Pick the EXACT hex that best represents the garment's primary color.
  Quick reference hex values:
  #000000=black, #FFFFFF=white, #F5F5DC=beige, #FFFDD0=cream, #C8A96E=camel, #808080=grey,
  #D2691E=terracotta, #722F37=wine, #DC143C=crimson, #FF6B6B=coral red, #8B4513=rust,
  #000080=navy, #4169E1=royal blue, #87CEEB=sky blue, #4682B4=steel blue, #008080=teal,
  #2E8B57=forest green, #556B2F=olive, #90EE90=mint, #6B8E23=sage, #228B22=emerald,
  #FFB6C1=blush pink, #FF1493=hot pink, #E8B4B8=dusty rose, #C71585=fuchsia, #FF7F50=coral,
  #EEE8AA=pale yellow, #DAA520=golden, #D2691E=burnt sienna, #EE82EE=violet, #DDA0DD=plum

════════════════════════════════════
STEP 4 — RETURN VALID JSON ONLY
════════════════════════════════════
Return ONLY a valid JSON object. No markdown fences. No extra text before or after:
{
  "imageType": "person-wearing | mannequin | flat-lay | product-photo | accessory-only",
  "title": "Specific, descriptive item title (e.g. Crimson Anarkali Suit with Gold Embroidery, Wide-Leg Navy Palazzo Pants, Oversized Sage Green Linen Blazer)",
  "garmentType": "exact type from Step 2 (e.g. anarkali suit, wide-leg jeans, bodycon dress, kolhapuri chappals)",
  "category": "one of exactly: Tops, Bottoms, Dresses, Outerwear, Footwear, Accessories, Ethnicwear, Sportswear",
  "colors": ["specific primary color name", "specific secondary color name if present", "pattern color if distinct"],
  "dominantColorHex": "#rrggbb — exact hex of the dominant garment color",
  "material": "specific fabric (cotton, silk, denim, wool, polyester, linen, leather, velvet, chiffon, georgette, crepe, organza, net, brocade, khadi, handloom)",
  "texture": "visual texture (smooth, ribbed, woven, knit, quilted, embossed, matte, glossy, sheer, embroidered, printed, pleated, ruffled)",
  "pattern": "solid | striped | floral | abstract print | geometric | animal print | tie-dye | houndstooth | plaid | checkered | polka dot | block print | digital print | embroidered | sequined | paisley | ikat | bandhani | kalamkari",
  "fit": "slim fit | regular fit | oversized | relaxed | bodycon | tailored | boxy | cropped | flared | flowy | structured | draped",
  "silhouette": "A-line | straight cut | wrap | flared | draped | structured | asymmetric | balloon | empire waist | hourglass | column",
  "styleEra": "minimalist | classic | bohemian | streetwear | Y2K | cottagecore | dark academia | vintage | preppy | athleisure | traditional Indian | contemporary fusion | Mughal | old money | maximalist | romantic",
  "trendTags": ["2025 micro-trend tags e.g.: Quiet Luxury, Ballet Core, Ethnic Couture, Coastal Grandmother, Office Siren, Dark Feminine, Clean Girl, Y2K Revival — pick 3-5 most relevant"],
  "occasion": "one of exactly: Casual, Formal, Sports, Party, Ethnic",
  "season": "one of exactly: Spring, Summer, Autumn, Winter",
  "careGuess": "machine washable | hand wash only | dry clean only | delicate cycle | spot clean",
  "summary": "One compelling fashionista sentence about this item's style story, referencing 2025 trends"
}

CRITICAL RULES:
• category MUST match garmentType: saree/kurta/lehenga/salwar/anarkali → Ethnicwear; jeans/trousers/skirt → Bottoms; dress/jumpsuit → Dresses; blazer/coat/hoodie → Outerwear
• If you see a human wearing the garment: DO NOT describe the person — describe ONLY the garment
• Colors must be specific (not just "red" — say "crimson red" or "brick red")
• dominantColorHex must visually match the colors array (if colors=["navy blue"] then hex should be near #000080)
• Be confident — never use "possibly", "maybe", "could be"`;


/* ─── helpers ─── */
function errStr(e: unknown): string {
  const d = (e as any)?.response?.data;
  if (typeof d === "string") return d;
  if (d?.error) return typeof d.error === "string" ? d.error : JSON.stringify(d.error);
  return (e as any)?.message ?? String(e);
}

/**
 * Vision classify:
 * 0. Local CLIP classifier (Python service) — returns structured JSON, fastest & free
 * 1. Ollama local LLM  — free but slow on Intel CPU
 * 2. Gemini Flash      — free API, 1500 req/day
 * 3. OpenRouter chain  — 5 free fallback models
 */
async function visionDescribe(imageSource: string): Promise<{ raw: string; usedModel: string }> {
  // ── 0. Local CLIP classifier (Python service on port 5001) ──
  // Returns structured JSON directly — no prompt parsing needed
  const clipResult = await localClassify(imageSource);
  if (clipResult) {
    console.log(`[describe] CLIP classifier succeeded (${clipResult.usedModel})`);
    return { raw: JSON.stringify(clipResult.classification), usedModel: clipResult.usedModel };
  }

  const ollamaModel = process.env.OLLAMA_VISION_MODEL?.trim() || "llava";

  // ── 1. Ollama local LLM ──
  console.log("[describe] Trying Ollama local model…");
  const ollamaRaw = await ollamaVision(DEEP_CLASSIFY_PROMPT, imageSource, 1200);
  if (ollamaRaw?.trim()) {
    console.log("[describe] Ollama succeeded");
    return { raw: ollamaRaw.trim(), usedModel: `ollama/${ollamaModel}` };
  }
  if (ollamaRaw === null) {
    console.log("[describe] Ollama not available — trying Gemini…");
  }

  // ── 2. Gemini Flash ──
  if (geminiEnabled) {
    console.log("[describe] Trying Gemini Flash…");
    const raw = await geminiVision(DEEP_CLASSIFY_PROMPT, imageSource, 1200);
    if (raw?.trim()) {
      console.log("[describe] Gemini Flash succeeded");
      return { raw: raw.trim(), usedModel: "gemini-2.0-flash" };
    }
    console.warn("[describe] Gemini returned null/empty — falling back to OpenRouter chain…");
  }

  // ── 3. OpenRouter fallback chain ──
  let lastErr: any;
  for (const model of VISION_MODELS) {
    if (!isModelHealthy(model)) {
      console.log(`[describe] Skipping unhealthy model: ${model}`);
      continue;
    }
    try {
      const { data } = await orClient.post("/v1/chat/completions", {
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: DEEP_CLASSIFY_PROMPT },
              { type: "image_url", image_url: { url: imageSource } },
            ],
          },
        ],
        max_tokens: 1200,
        temperature: 0.2,
      });
      const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
      if (raw) {
        markModelHealthy(model);
        console.log(`[describe] OR model succeeded: ${model}`);
        return { raw, usedModel: model };
      }
      lastErr = new Error("Empty response");
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status ?? e?.status;
      const msg = errStr(e).toLowerCase();
      const shouldContinue =
        status === 400 || status === 404 || status === 429 || status === 503 ||
        msg.includes("no endpoints found") || msg.includes("not a valid model") ||
        msg.includes("rate-limited") || msg.includes("rate limit") ||
        msg.includes("image") || msg.includes("temporarily") || msg.includes("unavailable");
      if (shouldContinue) {
        markModelFailed(model, status, msg);
        console.warn(`[describe] ${model} skipped (${status ?? msg.slice(0, 50)})`);
        continue;
      }
      break;
    }
  }

  throw lastErr ?? new Error("All vision models failed. Please try a different image or try again later.");
}

function parseClassification(raw: string): Record<string, any> {
  let clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);

  let parsed: Record<string, any> | null = null;
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Fix common AI JSON mistakes: trailing commas, single quotes
    clean = clean
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/'/g, '"');
    try { parsed = JSON.parse(clean); }
    catch { return { rawText: raw, parseError: true }; }
  }

  if (!parsed) return { rawText: raw, parseError: true };

  // ── Post-processing: normalise and correct AI output ──────────────────────

  // 1. Ensure category is a valid Section — always trust garmentType over category
  //    since the AI sometimes returns a free-text category name
  const garmentType = parsed.garmentType ?? parsed.title ?? "";
  const mappedSection = mapSectionGuess(garmentType) ?? mapSectionGuess(parsed.category);
  if (mappedSection) parsed.category = mappedSection;

  // 2. Detect sub-type for richer ethnic/garment labelling
  parsed.subType = detectSubType(garmentType) ?? detectSubType(parsed.title) ?? null;

  // 3. Validate dominantColorHex format — reject garbage values
  if (parsed.dominantColorHex) {
    const hex = String(parsed.dominantColorHex).trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      // Try to salvage a 3-char hex or hex without #
      const bare = hex.replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "");
      if (bare.length === 6) parsed.dominantColorHex = `#${bare}`;
      else if (bare.length === 3) parsed.dominantColorHex = `#${bare[0]}${bare[0]}${bare[1]}${bare[1]}${bare[2]}${bare[2]}`;
      else parsed.dominantColorHex = null; // discard invalid hex
    }
  }

  // 4. Ensure colors is always an array of strings, max 4
  if (!Array.isArray(parsed.colors)) {
    parsed.colors = parsed.colors ? [String(parsed.colors)] : [];
  }
  parsed.colors = parsed.colors.slice(0, 4).map((c: any) => String(c).trim()).filter(Boolean);

  // 5. Ensure trendTags is always an array, max 6
  if (!Array.isArray(parsed.trendTags)) {
    parsed.trendTags = parsed.trendTags ? [String(parsed.trendTags)] : [];
  }
  parsed.trendTags = parsed.trendTags.slice(0, 6).map((t: any) => String(t).trim()).filter(Boolean);

  // 6. Clamp season / occasion to valid enum values
  const VALID_SEASONS = ["Spring", "Summer", "Autumn", "Winter"];
  const VALID_OCCASIONS = ["Casual", "Formal", "Sports", "Party", "Ethnic"];
  if (!VALID_SEASONS.includes(parsed.season)) parsed.season = null;
  if (!VALID_OCCASIONS.includes(parsed.occasion)) {
    // Try to salvage obvious mismatches (e.g. "casual" → "Casual")
    const occ = VALID_OCCASIONS.find(
      (o) => o.toLowerCase() === String(parsed.occasion ?? "").toLowerCase()
    );
    parsed.occasion = occ ?? null;
  }

  // 7. Truncate very long strings
  if (parsed.title?.length > 120)   parsed.title   = parsed.title.slice(0, 120);
  if (parsed.summary?.length > 400) parsed.summary = parsed.summary.slice(0, 400);

  return parsed;
}

async function assertImage(url: string) {
  let status = 0, ct = "";
  try {
    const head = await axios.head(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
    status = head.status;
    ct = String(head.headers["content-type"] || "").toLowerCase();
  } catch {
    const get = await axios.get(url, {
      timeout: 8000, maxRedirects: 3, responseType: "stream",
      headers: { Range: "bytes=0-0" }, validateStatus: () => true,
    });
    status = get.status;
    ct = String(get.headers["content-type"] || "").toLowerCase();
    try { (get.data as any)?.destroy?.(); } catch {}
  }
  if (!(status >= 200 && status < 400) || !ct.startsWith("image/"))
    throw new Error(`Not a valid public image (status=${status}, type=${ct}). Please use a direct image URL.`);
}

/** Build Prisma item data from a classification object.
 *  parseClassification() has already normalised all fields before this runs.
 */
function buildItemData(userId: string, imageUrl: string, c: Record<string, any>) {
  // category was already remapped by parseClassification's post-processing,
  // but run mapSectionGuess as a final safety net.
  const section =
    mapSectionGuess(c.category) ??
    mapSectionGuess(c.garmentType) ??
    mapSectionGuess(c.title);

  // Merge subType into styleTags so the recommendation engine can detect
  // ethnic sub-types (kurta/saree/lehenga) without a separate DB column.
  const baseTags: string[] = Array.isArray(c.trendTags) ? c.trendTags : [];
  const subTypeTag = c.subType ?? null;
  const garmentTag = c.garmentType ?? null;
  const allTags = [
    ...baseTags,
    ...(subTypeTag ? [subTypeTag] : []),
    ...(garmentTag && !baseTags.includes(garmentTag) ? [garmentTag] : []),
  ].slice(0, 8);

  return {
    ownerId:          userId,
    imageUrl,
    title:            c.title?.slice(0, 120) || "Classified Item",
    section:          section ?? null,
    season:           (["Spring","Summer","Autumn","Winter"].includes(c.season) ? c.season : null) as any,
    occasion:         (["Casual","Formal","Sports","Party","Ethnic"].includes(c.occasion) ? c.occasion : null) as any,
    color:            Array.isArray(c.colors) ? c.colors.slice(0, 4) : [],
    dominantColorHex: c.dominantColorHex ?? null,
    material:         c.material ?? null,
    texture:          c.texture ?? null,
    pattern:          c.pattern ?? null,
    fit:              c.fit ?? null,
    silhouette:       c.silhouette ?? null,
    styleEra:         c.styleEra ?? null,
    styleTags:        allTags,
    careGuess:        c.careGuess ?? null,
    // deepSummary stores the fashionista summary + image type context for LLM
    deepSummary:      [
      c.summary ?? null,
      c.imageType ? `[Image: ${c.imageType}]` : null,
    ].filter(Boolean).join(" ") || null,
    // 2025 trend intelligence — populated when CLIP classifier is available
    microTrend:       c.microTrend ?? null,
    trendiness:       typeof c.trendiness === "number" ? c.trendiness : null,
    approved:         true,
  };
}

const BodyUrl = z.object({
  imageUrl: z.string().url(),
  saveItem: z.boolean().optional().default(false),
});

/* ─── POST /describe  (URL mode) ─── */
router.post("/", requireAuth, async (req, res) => {
  const parsed = BodyUrl.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { imageUrl, saveItem } = parsed.data;

  if (process.env.MOCK_AI === "true") {
    const mock = {
      title: "Classic White Cotton Shirt", category: "Tops", colors: ["white"],
      dominantColorHex: "#ffffff", material: "cotton", texture: "smooth woven",
      pattern: "solid", fit: "regular fit", silhouette: "straight cut",
      styleEra: "minimalist", trendTags: ["classic staple", "versatile", "clean aesthetic"],
      occasion: "Casual", season: "Spring", careGuess: "machine washable",
      summary: "A timeless white cotton shirt that anchors any minimalist wardrobe.",
    };
    return res.json({ classification: mock, item: null, model: "mock" });
  }

  try {
    await assertImage(imageUrl);
    const { raw, usedModel } = await visionDescribe(imageUrl);
    const classification = parseClassification(raw);

    let item: any = null;
    if (saveItem && !classification.parseError) {
      item = await prisma.item.create({ data: buildItemData(req.auth!.sub, imageUrl, classification) as any });
    }

    return res.json({ classification, item, model: usedModel });
  } catch (e) {
    console.error("[describe] error:", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  }
});

/* ─── POST /describe/upload  (file upload mode) ─── */
router.post("/upload", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "image required" });

  const saveItem = req.body?.saveItem === "true" || req.body?.saveItem === true;
  const filePath = req.file.path;

  if (process.env.MOCK_AI === "true") {
    fs.unlink(filePath, () => {});
    return res.json({
      classification: {
        title: "Mock Item", category: "Tops", colors: ["black"], material: "cotton",
        texture: "smooth", pattern: "solid", fit: "regular fit", silhouette: "straight",
        styleEra: "minimalist", trendTags: ["classic"], occasion: "Casual",
        season: "Spring", careGuess: "machine washable", summary: "Mock classification.",
        dominantColorHex: "#000000",
      },
      item: null, model: "mock", uploadedImageDataUrl: null,
    });
  }

  // Flag: did we hit an error? Only delete the file on error — never on success.
  let hadError = false;
  let optimizedFilename = req.file.filename;

  try {
    // Feature 21: Optimize uploaded image with Sharp (resize to max 1080px, convert to WebP)
    const sharpFn = await getSharp();
    if (sharpFn) {
      try {
        const webpFilename = req.file.filename.replace(/\.[^.]+$/, ".webp");
        const webpPath = path.join(uploadDir, webpFilename);
        await sharpFn(filePath)
          .resize({ width: 1080, height: 1080, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 85 })
          .toFile(webpPath);
        fs.unlink(filePath, () => {});
        optimizedFilename = webpFilename;
        console.log(`[describe] Image optimized → ${webpFilename}`);
      } catch (sharpErr) {
        console.warn("[describe] Sharp optimization failed, using original:", (sharpErr as any)?.message);
      }
    }

    const optimizedPath = path.join(uploadDir, optimizedFilename);
    const optimizedUrl = `${BACKEND_URL}/uploads/${optimizedFilename}`;

    const buf = fs.readFileSync(optimizedPath);
    const mime = optimizedFilename.endsWith(".webp") ? "image/webp" : req.file.mimetype;
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

    const { raw, usedModel } = await visionDescribe(dataUrl);
    const classification = parseClassification(raw);

    let item: any = null;
    if (saveItem && !classification.parseError) {
      item = await prisma.item.create({ data: buildItemData(req.auth!.sub, optimizedUrl, classification) });
    }

    return res.json({
      classification,
      item,
      model: usedModel,
      // Public URL — frontend stores this and sends it when the user saves to wardrobe
      uploadedImageUrl: optimizedUrl,
    });
  } catch (e) {
    hadError = true;
    console.error("[describe/upload] error:", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  } finally {
    // Only delete the file if an error occurred (the file won't be used by anyone)
    if (hadError) {
      const toDelete = path.join(uploadDir, optimizedFilename ?? req.file.filename);
      fs.unlink(toDelete, () => {});
    }
  }
});

/* ─── POST /describe/save  ─────────────────────────────────────────────────
   Save a pre-computed classification to the wardrobe WITHOUT re-running AI.
   The frontend calls this after the user clicks "Save to Wardrobe".
   Body: { imageUrl, classification }
──────────────────────────────────────────────────────────────────────────── */
const SaveBody = z.object({
  imageUrl: z.string().optional().default(""),
  classification: z.record(z.any()),
});

router.post("/save", requireAuth, async (req, res) => {
  const parsed = SaveBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { imageUrl, classification } = parsed.data;

  if (classification.parseError)
    return res.status(400).json({ error: "Cannot save an item with a parse error in classification." });

  try {
    const item = await prisma.item.create({
      data: buildItemData(req.auth!.sub, imageUrl || "", classification) as any,
    });
    return res.status(201).json({ item });
  } catch (e) {
    console.error("[describe/save] error:", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  }
});

export default router;
