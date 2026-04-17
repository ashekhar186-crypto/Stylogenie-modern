"use strict";
// backend/src/routes/describe.ts — v7
// Deep AI fashion classification.
// Vision call order:
//   0. Local CLIP classifier (Python service, port 5001) — ~3-8s, no API, returns JSON directly
//   1. Ollama vision (local LLM — slow on Intel CPU, fast on M-series)
//   2. Gemini Flash (free API, 1500 req/day)
//   3. OpenRouter fallback chain (5 free vision models)
// Extra endpoint: POST /describe/save  — saves pre-computed classification without re-running AI
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../db/prisma");
const zod_1 = require("zod");
const axios_1 = __importDefault(require("axios"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const openrouter_1 = require("../lib/openrouter");
const mapSectionGuess_1 = require("../lib/mapSectionGuess");
const gemini_1 = require("../lib/gemini");
const ollama_1 = require("../lib/ollama");
const localClassifier_1 = require("../lib/localClassifier");
const modelHealth_1 = require("../lib/modelHealth");
const router = (0, express_1.Router)();
/* ─── upload dir ─────────────────────────────────────────────────────────────
   Must match the static-serving path in server.ts ("/uploads" → cwd/uploads).
   Previously used ".uploads" (hidden folder) which was never publicly served.
─────────────────────────────────────────────────────────────────────────── */
const uploadDir = path_1.default.join(process.cwd(), "uploads");
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, "");
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Images only")),
});
/* ─── OR vision fallback chain ─── */
const VISION_MODELS = (process.env.OPENROUTER_MODEL_VISION_LIST?.trim() ||
    "qwen/qwen-2.5-vl-7b-instruct:free,meta-llama/llama-3.2-11b-vision-instruct:free,mistralai/pixtral-12b:free")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
/* ─── deep classification prompt ─── */
// Note: we explicitly instruct the model to focus on the clothing even when a person is wearing it.
// This avoids Gemini safety-filter blocks on images of real people.
const DEEP_CLASSIFY_PROMPT = `You are an elite fashion analyst and textile expert.

The image may show a garment on a person, on a mannequin, as a flat-lay, or as a product photo. In all cases, focus ONLY on the clothing or accessory item — not the person wearing it.

Return ONLY a valid JSON object with EXACTLY these fields (no extra text, no markdown fences):
{
  "title": "concise item title (e.g. Oversized Ribbed Knit Sweater)",
  "category": "one of: Tops, Bottoms, Dresses, Outerwear, Footwear, Accessories, Ethnicwear, Sportswear",
  "colors": ["primary color name", "secondary color if present"],
  "dominantColorHex": "#rrggbb best approximation of the dominant color",
  "material": "inferred fabric (e.g. cotton, silk, denim, wool, polyester, linen, leather, velvet, chiffon, cashmere)",
  "texture": "texture description (e.g. smooth, ribbed, woven, knit, quilted, embossed, brushed, matte, glossy)",
  "pattern": "pattern type (e.g. solid, striped, floral, plaid, graphic print, abstract, animal print, tie-dye, houndstooth, embroidered)",
  "fit": "fit type (e.g. slim fit, regular fit, oversized, relaxed, bodycon, tailored, boxy, cropped)",
  "silhouette": "shape/cut (e.g. A-line, straight cut, wrap, flared, draped, structured, asymmetric)",
  "styleEra": "fashion era or aesthetic (e.g. Y2K, minimalist, streetwear, bohemian, vintage 90s, cottagecore, dark academia, contemporary, athleisure, traditional Indian, fusion ethnic)",
  "trendTags": ["up to 5 trend/style tags e.g.: oversized, neutral tones, layering piece, statement piece, classic staple"],
  "occasion": "one of: Casual, Formal, Sports, Party, Ethnic",
  "season": "one of: Spring, Summer, Autumn, Winter",
  "careGuess": "inferred care instruction (e.g. machine washable, hand wash recommended, dry clean only)",
  "summary": "one exciting fashionista sentence describing the item's style appeal"
}

Base material/texture inferences on visual cues: drape = silk/chiffon; stiffness = denim/canvas; sheen = satin/polyester; cable knit = wool/cotton. Be confident and specific.`;
/* ─── helpers ─── */
function errStr(e) {
    const d = e?.response?.data;
    if (typeof d === "string")
        return d;
    if (d?.error)
        return typeof d.error === "string" ? d.error : JSON.stringify(d.error);
    return e?.message ?? String(e);
}
/**
 * Vision classify:
 * 0. Local CLIP classifier (Python service) — returns structured JSON, fastest & free
 * 1. Ollama local LLM  — free but slow on Intel CPU
 * 2. Gemini Flash      — free API, 1500 req/day
 * 3. OpenRouter chain  — 5 free fallback models
 */
async function visionDescribe(imageSource) {
    // ── 0. Local CLIP classifier (Python service on port 5001) ──
    // Returns structured JSON directly — no prompt parsing needed
    const clipResult = await (0, localClassifier_1.localClassify)(imageSource);
    if (clipResult) {
        console.log(`[describe] CLIP classifier succeeded (${clipResult.usedModel})`);
        return { raw: JSON.stringify(clipResult.classification), usedModel: clipResult.usedModel };
    }
    const ollamaModel = process.env.OLLAMA_VISION_MODEL?.trim() || "llava";
    // ── 1. Ollama local LLM ──
    console.log("[describe] Trying Ollama local model…");
    const ollamaRaw = await (0, ollama_1.ollamaVision)(DEEP_CLASSIFY_PROMPT, imageSource, 800);
    if (ollamaRaw?.trim()) {
        console.log("[describe] Ollama succeeded");
        return { raw: ollamaRaw.trim(), usedModel: `ollama/${ollamaModel}` };
    }
    if (ollamaRaw === null) {
        console.log("[describe] Ollama not available — trying Gemini…");
    }
    // ── 2. Gemini Flash ──
    if (gemini_1.geminiEnabled) {
        console.log("[describe] Trying Gemini Flash…");
        const raw = await (0, gemini_1.geminiVision)(DEEP_CLASSIFY_PROMPT, imageSource, 800);
        if (raw?.trim()) {
            console.log("[describe] Gemini Flash succeeded");
            return { raw: raw.trim(), usedModel: "gemini-2.0-flash" };
        }
        console.warn("[describe] Gemini returned null/empty — falling back to OpenRouter chain…");
    }
    // ── 3. OpenRouter fallback chain ──
    let lastErr;
    for (const model of VISION_MODELS) {
        if (!(0, modelHealth_1.isModelHealthy)(model)) {
            console.log(`[describe] Skipping unhealthy model: ${model}`);
            continue;
        }
        try {
            const { data } = await openrouter_1.orClient.post("/v1/chat/completions", {
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
                max_tokens: 800,
                temperature: 0.2,
            });
            const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
            if (raw) {
                (0, modelHealth_1.markModelHealthy)(model);
                console.log(`[describe] OR model succeeded: ${model}`);
                return { raw, usedModel: model };
            }
            lastErr = new Error("Empty response");
        }
        catch (e) {
            lastErr = e;
            const status = e?.response?.status ?? e?.status;
            const msg = errStr(e).toLowerCase();
            const shouldContinue = status === 400 || status === 404 || status === 429 || status === 503 ||
                msg.includes("no endpoints found") || msg.includes("not a valid model") ||
                msg.includes("rate-limited") || msg.includes("rate limit") ||
                msg.includes("image") || msg.includes("temporarily") || msg.includes("unavailable");
            if (shouldContinue) {
                (0, modelHealth_1.markModelFailed)(model, status, msg);
                console.warn(`[describe] ${model} skipped (${status ?? msg.slice(0, 50)})`);
                continue;
            }
            break;
        }
    }
    throw lastErr ?? new Error("All vision models failed. Please try a different image or try again later.");
}
function parseClassification(raw) {
    let clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start !== -1 && end !== -1)
        clean = clean.slice(start, end + 1);
    try {
        return JSON.parse(clean);
    }
    catch {
        clean = clean.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
        try {
            return JSON.parse(clean);
        }
        catch {
            return { rawText: raw, parseError: true };
        }
    }
}
async function assertImage(url) {
    let status = 0, ct = "";
    try {
        const head = await axios_1.default.head(url, { timeout: 8000, maxRedirects: 3, validateStatus: () => true });
        status = head.status;
        ct = String(head.headers["content-type"] || "").toLowerCase();
    }
    catch {
        const get = await axios_1.default.get(url, {
            timeout: 8000, maxRedirects: 3, responseType: "stream",
            headers: { Range: "bytes=0-0" }, validateStatus: () => true,
        });
        status = get.status;
        ct = String(get.headers["content-type"] || "").toLowerCase();
        try {
            get.data?.destroy?.();
        }
        catch { }
    }
    if (!(status >= 200 && status < 400) || !ct.startsWith("image/"))
        throw new Error(`Not a valid public image (status=${status}, type=${ct}). Please use a direct image URL.`);
}
/** Build Prisma item data from a classification object */
function buildItemData(userId, imageUrl, c) {
    const section = (0, mapSectionGuess_1.mapSectionGuess)(c.category || c.title);
    return {
        ownerId: userId,
        imageUrl,
        title: c.title?.slice(0, 120) || "Classified Item",
        section: section ?? null,
        season: (["Spring", "Summer", "Autumn", "Winter"].includes(c.season) ? c.season : null),
        occasion: (["Casual", "Formal", "Sports", "Party", "Ethnic"].includes(c.occasion) ? c.occasion : null),
        color: Array.isArray(c.colors) ? c.colors : [],
        dominantColorHex: c.dominantColorHex ?? null,
        material: c.material ?? null,
        texture: c.texture ?? null,
        pattern: c.pattern ?? null,
        fit: c.fit ?? null,
        silhouette: c.silhouette ?? null,
        styleEra: c.styleEra ?? null,
        styleTags: Array.isArray(c.trendTags) ? c.trendTags : [],
        careGuess: c.careGuess ?? null,
        deepSummary: c.summary ?? null,
        // 2025 trend intelligence — populated when CLIP classifier is available
        microTrend: c.microTrend ?? null,
        trendiness: typeof c.trendiness === "number" ? c.trendiness : null,
        approved: false,
    };
}
const BodyUrl = zod_1.z.object({
    imageUrl: zod_1.z.string().url(),
    saveItem: zod_1.z.boolean().optional().default(false),
});
/* ─── POST /describe  (URL mode) ─── */
router.post("/", auth_1.requireAuth, async (req, res) => {
    const parsed = BodyUrl.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
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
        let item = null;
        if (saveItem && !classification.parseError) {
            item = await prisma_1.prisma.item.create({ data: buildItemData(req.auth.sub, imageUrl, classification) });
        }
        return res.json({ classification, item, model: usedModel });
    }
    catch (e) {
        console.error("[describe] error:", errStr(e));
        return res.status(500).json({ error: errStr(e) });
    }
});
/* ─── POST /describe/upload  (file upload mode) ─── */
router.post("/upload", auth_1.requireAuth, upload.single("image"), async (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: "image required" });
    const saveItem = req.body?.saveItem === "true" || req.body?.saveItem === true;
    const filePath = req.file.path;
    if (process.env.MOCK_AI === "true") {
        fs_1.default.unlink(filePath, () => { });
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
    // Build the public URL so the wardrobe can display the image
    const publicImageUrl = `${BACKEND_URL}/uploads/${req.file.filename}`;
    // Flag: did we hit an error? Only delete the file on error — never on success.
    // The file MUST survive on disk after this request so that when the user later
    // clicks "Save to Wardrobe" the URL still resolves.  A background cleanup job
    // can remove unclaimed files older than N hours if disk space becomes a concern.
    let hadError = false;
    try {
        const buf = fs_1.default.readFileSync(filePath);
        const dataUrl = `data:${req.file.mimetype};base64,${buf.toString("base64")}`;
        const { raw, usedModel } = await visionDescribe(dataUrl);
        const classification = parseClassification(raw);
        let item = null;
        if (saveItem && !classification.parseError) {
            item = await prisma_1.prisma.item.create({ data: buildItemData(req.auth.sub, publicImageUrl, classification) });
        }
        return res.json({
            classification,
            item,
            model: usedModel,
            // Public URL — frontend stores this and sends it when the user saves to wardrobe
            uploadedImageUrl: publicImageUrl,
        });
    }
    catch (e) {
        hadError = true;
        console.error("[describe/upload] error:", errStr(e));
        return res.status(500).json({ error: errStr(e) });
    }
    finally {
        // Only delete the file if an error occurred (the file won't be used by anyone)
        if (hadError)
            fs_1.default.unlink(filePath, () => { });
    }
});
/* ─── POST /describe/save  ─────────────────────────────────────────────────
   Save a pre-computed classification to the wardrobe WITHOUT re-running AI.
   The frontend calls this after the user clicks "Save to Wardrobe".
   Body: { imageUrl, classification }
──────────────────────────────────────────────────────────────────────────── */
const SaveBody = zod_1.z.object({
    imageUrl: zod_1.z.string().optional().default(""),
    classification: zod_1.z.record(zod_1.z.any()),
});
router.post("/save", auth_1.requireAuth, async (req, res) => {
    const parsed = SaveBody.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    const { imageUrl, classification } = parsed.data;
    if (classification.parseError)
        return res.status(400).json({ error: "Cannot save an item with a parse error in classification." });
    try {
        const item = await prisma_1.prisma.item.create({
            data: buildItemData(req.auth.sub, imageUrl || "", classification),
        });
        return res.status(201).json({ item });
    }
    catch (e) {
        console.error("[describe/save] error:", errStr(e));
        return res.status(500).json({ error: errStr(e) });
    }
});
exports.default = router;
