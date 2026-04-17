// backend/src/routes/trip.ts — v3
// Trip Planner: wardrobe-aware plan + AI destination discovery + Wikipedia images + budget tiers
import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../db/prisma";
import { z } from "zod";
import axios from "axios";
import multer from "multer";
import fs from "fs";
import path from "path";
import { orClient } from "../lib/openrouter";   // vision-only fallback (Groq doesn't support images)
import { geminiVision, geminiChat, geminiEnabled } from "../lib/gemini";
import { ollamaVision } from "../lib/ollama";
import { groqChat, groqEnabled } from "../lib/groq";
import { isModelHealthy, markModelFailed, markModelHealthy } from "../lib/modelHealth";

const router = Router();

const GROQ_MODEL_TAG = process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.1-8b-instant";
// Use the larger 70B model for complex trip planning JSON — much better structured output.
// Falls back to the env-configured model if explicitly overridden.
const TRIP_GROQ_MODEL = process.env.GROQ_TRIP_MODEL?.trim() || "llama-3.3-70b-versatile";

// OR vision fallback — only used when GEMINI_API_KEY is not set
const VISION_MODELS = (
  process.env.OPENROUTER_MODEL_VISION_LIST?.trim() ||
  "meta-llama/llama-3.2-11b-vision-instruct:free"
).split(",").map((s) => s.trim()).filter(Boolean);

/* ─── upload dir ─── */
const uploadDir = path.join(process.cwd(), ".uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error("Images only")),
});

/* ─── helpers ─── */
function errStr(e: unknown): string {
  const d = (e as any)?.response?.data;
  if (typeof d === "string") return d;
  if (d?.error) return typeof d.error === "string" ? d.error : JSON.stringify(d.error);
  return (e as any)?.message ?? String(e);
}

async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) {
      last = e;
      const s = Number(e?.status) || Number(e?.response?.status);
      if (s === 429 || s >= 500) { await new Promise((r) => setTimeout(r, i === 0 ? 1000 : 2000)); continue; }
      break;
    }
  }
  throw last;
}

function parseJson(raw: string): any {
  let clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = clean.indexOf("{"); const end = clean.lastIndexOf("}");
  if (start !== -1 && end !== -1) clean = clean.slice(start, end + 1);
  try { return JSON.parse(clean); } catch { return null; }
}

const UA = "StyloGenie/3.0 (travel planner; contact@stylogenie.com)";

/* ─── Wikipedia REST: page summary + thumbnail ─── */
async function fetchWikiSummary(title: string): Promise<{ imageUrl: string | null; description: string | null }> {
  try {
    const encoded = encodeURIComponent(title.replace(/\s+/g, "_"));
    const res = await axios.get(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
      { timeout: 6000, headers: { "User-Agent": UA } }
    );
    return {
      imageUrl: res.data?.thumbnail?.source ?? res.data?.originalimage?.source ?? null,
      description: res.data?.extract ?? null,
    };
  } catch {
    return { imageUrl: null, description: null };
  }
}

/* ─── Wikimedia Commons: keyword image search (no API key, free, unlimited) ─── */
async function fetchCommonsImage(keywords: string[]): Promise<string | null> {
  // Build a rich search query: "Kashmir mountains snow landscape travel"
  const query = keywords.filter(Boolean).join(" ").trim();
  if (!query) return null;
  try {
    // Step 1: Search Commons for matching files
    const searchRes = await axios.get("https://commons.wikimedia.org/w/api.php", {
      params: {
        action: "query", format: "json", list: "search",
        srsearch: query, srnamespace: 6,   // namespace 6 = File:
        srlimit: 8, utf8: 1,
      },
      timeout: 6000,
      headers: { "User-Agent": UA },
    });

    const hits: any[] = searchRes.data?.query?.search ?? [];
    if (!hits.length) return null;

    // Step 2: Get image URL from the first result that looks like a photo
    const photoHit = hits.find((h) =>
      /\.(jpg|jpeg|png|webp)$/i.test(h.title)
    ) ?? hits[0];

    if (!photoHit?.title) return null;

    const infoRes = await axios.get("https://commons.wikimedia.org/w/api.php", {
      params: {
        action: "query", format: "json", prop: "imageinfo",
        titles: photoHit.title, iiprop: "url", iiurlwidth: 800, utf8: 1,
      },
      timeout: 6000,
      headers: { "User-Agent": UA },
    });

    const pages = infoRes.data?.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;
    return page?.imageinfo?.[0]?.thumburl ?? page?.imageinfo?.[0]?.url ?? null;
  } catch {
    return null;
  }
}

/* ─── Master image fetcher: Wikipedia → Commons search → Wikimedia keyword ─── */
async function fetchWikiData(
  searchTerm: string,
  extraKeywords: string[] = []
): Promise<{ imageUrl: string | null; description: string | null }> {
  // 1. Try Wikipedia REST (fastest, best structured description)
  const wiki = await fetchWikiSummary(searchTerm);

  // 2. If no image from Wikipedia, try Wikimedia Commons with richer keywords
  let imageUrl = wiki.imageUrl;
  if (!imageUrl) {
    const keywords = [searchTerm, ...extraKeywords, "travel", "landscape"].filter(Boolean);
    imageUrl = await fetchCommonsImage(keywords);
  }

  // 3. Last resort: Commons search with just the destination name
  if (!imageUrl) {
    imageUrl = await fetchCommonsImage([searchTerm, "travel"]);
  }

  return { imageUrl, description: wiki.description };
}

/* ─── Image fallback: Wikimedia Commons direct keyword (no loremflickr) ─── */
async function unsplashFallback(query: string): Promise<string | null> {
  const keywords = query.replace(/[^a-z0-9 ]/gi, " ").trim().split(/\s+/).slice(0, 4);
  return fetchCommonsImage([...keywords, "travel", "landscape"]);
}

/* ─── booking link builder ─── */
function buildBookingLinks(destination: string, startDate?: string, endDate?: string) {
  const enc = encodeURIComponent(destination);
  const start = startDate?.replace(/-/g, "") || "";
  return {
    flights: [
      { name: "Google Flights", url: `https://www.google.com/travel/flights?q=flights+to+${enc}${start ? `&tfs=${start}` : ""}`, icon: "✈️", description: "Search cheapest flights" },
      { name: "Skyscanner", url: `https://www.skyscanner.com/flights-to/${enc.toLowerCase().replace(/\s+/g, "-")}/${start || ""}`, icon: "🔍", description: "Compare all airlines" },
    ],
    trains: [
      { name: "IRCTC (India Rail)", url: `https://www.irctc.co.in/nget/train-search`, icon: "🚂", description: "Book Indian Railways" },
      { name: "Redbus", url: `https://www.redbus.in/`, icon: "🚌", description: "Book buses & trains" },
      { name: "Rome2Rio", url: `https://www.rome2rio.com/s/${enc}`, icon: "🗺️", description: "All transport options" },
    ],
    hotels: [
      { name: "Booking.com", url: `https://www.booking.com/searchresults.html?ss=${enc}${startDate ? `&checkin=${startDate}` : ""}${endDate ? `&checkout=${endDate}` : ""}`, icon: "🏨", description: "Compare hotel prices" },
      { name: "Airbnb", url: `https://www.airbnb.com/s/${enc}/homes${startDate ? `?checkin=${startDate}&checkout=${endDate}` : ""}`, icon: "🏠", description: "Unique stays & apartments" },
    ],
    localTransport: [
      { name: "Uber", url: `https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[formatted_address]=${enc}`, icon: "🚗", description: "Book rides at destination" },
      { name: "Rapido", url: `https://rapido.bike/`, icon: "🛵", description: "Bike taxis & autos" },
    ],
  };
}

/* ─── Real Weather API (OpenWeatherMap) ─── */
interface RealWeather {
  temperature: string;
  feelsLike: string;
  humidity: string;
  description: string;
  windSpeed: string;
  icon: string;
  city: string;
  country: string;
  source: "openweathermap";
}

async function fetchRealWeather(destination: string): Promise<RealWeather | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  try {
    // Geocode the destination to get lat/lon
    const geoRes = await axios.get("https://api.openweathermap.org/geo/1.0/direct", {
      params: { q: destination, limit: 1, appid: apiKey },
      timeout: 5000,
    });
    const geoData = geoRes.data?.[0];
    if (!geoData) return null;

    const { lat, lon, name, country } = geoData;

    // Fetch current weather
    const weatherRes = await axios.get("https://api.openweathermap.org/data/2.5/weather", {
      params: { lat, lon, appid: apiKey, units: "metric" },
      timeout: 5000,
    });
    const w = weatherRes.data;
    const temp = Math.round(w.main?.temp ?? 0);
    const feelsLike = Math.round(w.main?.feels_like ?? 0);
    const humidity = w.main?.humidity ?? 0;
    const desc = w.weather?.[0]?.description ?? "";
    const windKmh = Math.round((w.wind?.speed ?? 0) * 3.6);
    const icon = w.weather?.[0]?.icon ?? "";

    return {
      temperature: `${temp}°C`,
      feelsLike: `${feelsLike}°C`,
      humidity: `${humidity}%`,
      description: desc.charAt(0).toUpperCase() + desc.slice(1),
      windSpeed: `${windKmh} km/h`,
      icon: icon ? `https://openweathermap.org/img/wn/${icon}@2x.png` : "",
      city: name,
      country: country ?? "",
      source: "openweathermap",
    };
  } catch (e) {
    console.warn("[weather] OpenWeatherMap fetch failed:", (e as any)?.message);
    return null;
  }
}

/* ─── Style Profile Builder ─── */
type WardrobeItem = {
  id: string; title: string | null; section: string | null; color: string[];
  material: string | null; texture: string | null; pattern: string | null;
  fit: string | null; silhouette: string | null; styleEra: string | null;
  occasion: string | null; season: string | null; styleTags: string[]; deepSummary: string | null;
  microTrend: string | null;   // 2025 micro-trend from CLIP classifier
};
type StyleProfile = {
  dominantColors: string[]; accentColors: string[]; preferredStyleEras: string[];
  preferredFits: string[]; preferredOccasions: string[]; preferredMaterials: string[];
  preferredSections: string[]; totalItems: number; description: string;
};

function buildStyleProfile(items: WardrobeItem[]): StyleProfile {
  const freq = <T extends string>(arr: (T | null | undefined)[]): [T, number][] => {
    const map: Record<string, number> = {};
    for (const v of arr) { if (!v) continue; const k = v.trim().toLowerCase(); map[k] = (map[k] ?? 0) + 1; }
    return (Object.entries(map) as [T, number][]).sort((a, b) => b[1] - a[1]);
  };
  const topN = <T extends string>(arr: (T | null | undefined)[], n: number): T[] =>
    freq(arr).slice(0, n).map(([k]) => k as T);

  const allColors = items.flatMap((it) => it.color ?? []);
  const colorFreq = freq(allColors);
  const dominantColors = colorFreq.slice(0, 3).map(([k]) => k);
  const accentColors = colorFreq.slice(3, 5).map(([k]) => k);
  const preferredStyleEras = topN(items.map((i) => i.styleEra), 2);
  const preferredFits = topN(items.map((i) => i.fit), 2);
  const preferredOccasions = topN(items.map((i) => i.occasion), 2);
  const preferredMaterials = topN(items.map((i) => i.material), 3);
  const preferredSections = topN(items.map((i) => i.section), 4);
  const topColor = dominantColors[0] ?? "neutral";
  const topEra = preferredStyleEras[0] ?? "contemporary";
  const topFit = preferredFits[0] ?? "regular fit";
  return {
    dominantColors, accentColors, preferredStyleEras, preferredFits,
    preferredOccasions, preferredMaterials, preferredSections,
    totalItems: items.length,
    description: `Leans toward ${topColor}-dominant ${topEra} aesthetic with ${topFit} silhouettes.`,
  };
}

/* ─── 2025 Trend scores (for trip prompt enrichment) ─── */
const TRIP_TREND_SCORES: Record<string, number> = {
  "Quiet Luxury": 0.97, "Office Siren": 0.94, "Ballet Core": 0.91,
  "Dark Feminine": 0.90, "Clean Girl Aesthetic": 0.89, "Streetwear Luxe": 0.88,
  "Y2K Revival": 0.86, "Ethnic Couture": 0.85, "Preppy Revival": 0.83,
  "Cottagecore": 0.82, "Athleisure Luxe": 0.81, "Gorpcore": 0.80,
  "Coastal Grandmother": 0.76, "Mob Wife Aesthetic": 0.74, "Contemporary": 0.72,
};

function buildTrendProfile(items: WardrobeItem[]): { dominantTrend: string; trendScore: number; trendSummary: string } {
  const trendCounts = new Map<string, number>();
  for (const item of items) {
    const t = item.microTrend ?? "Contemporary";
    trendCounts.set(t, (trendCounts.get(t) ?? 0) + 1);
  }
  if (trendCounts.size === 0) return { dominantTrend: "Contemporary", trendScore: 0.72, trendSummary: "Versatile wardrobe with contemporary sensibility." };
  const sorted = [...trendCounts.entries()].sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const score = TRIP_TREND_SCORES[dominant] ?? 0.72;
  const top2 = sorted.slice(0, 2).map(([t, c]) => `${t} (${c} pieces)`).join(" + ");
  return {
    dominantTrend: dominant,
    trendScore: score,
    trendSummary: `Wardrobe aesthetic: ${top2}. Trendiness score: ${Math.round(score * 100)}% aligned with 2025 fashion.`,
  };
}

/* ─── ENHANCED trip plan prompt ─── */
function buildSmartTripPrompt(
  destination: string, startDate: string | undefined, endDate: string | undefined,
  bagType: string | undefined, bagSize: string | undefined, bagNotes: string | undefined,
  tripDays: number, wardrobeItems: WardrobeItem[], styleProfile: StyleProfile
) {
  const TODAY = new Date().toISOString().split("T")[0];
  const trendProfile = buildTrendProfile(wardrobeItems);

  const wardrobeBlock = wardrobeItems.length > 0
    ? wardrobeItems.map((it, idx) =>
        `[W${idx + 1}] ${it.title || "Untitled"} | Section: ${it.section ?? "?"} | Colors: ${it.color?.join(", ") || "?"} | Material: ${it.material ?? "?"} | Fit: ${it.fit ?? "?"} | StyleEra: ${it.styleEra ?? "?"} | Trend: ${it.microTrend ?? "Contemporary"} | Occasion: ${it.occasion ?? "?"} | Season: ${it.season ?? "?"} | Tags: ${it.styleTags?.join(", ") || "?"}`
      ).join("\n")
    : "No wardrobe items available — provide general packing recommendations.";

  return `You are a world-class travel fashion consultant, personal stylist, and destination expert. Today is ${TODAY}.

═══════════════════════════════════════
TRIP DETAILS
═══════════════════════════════════════
Destination: ${destination}
Travel Dates: ${startDate || "soon"} → ${endDate || "open-ended"} (${tripDays} days)
Bag: ${bagType || "medium suitcase"} · ${bagSize || "medium capacity"}
Special Notes: ${bagNotes || "none"}

═══════════════════════════════════════
USER STYLE PROFILE
═══════════════════════════════════════
Dominant Colours: ${styleProfile.dominantColors.join(", ") || "mixed"}
Accent Colours: ${styleProfile.accentColors.join(", ") || "none identified"}
Preferred Style Eras: ${styleProfile.preferredStyleEras.join(", ") || "contemporary"}
Preferred Fits: ${styleProfile.preferredFits.join(", ") || "regular fit"}
Preferred Occasions: ${styleProfile.preferredOccasions.join(", ") || "casual"}
Preferred Materials: ${styleProfile.preferredMaterials.join(", ") || "mixed"}
Wardrobe Personality: ${styleProfile.description}
2025 Trend Profile: ${trendProfile.trendSummary}
Dominant Micro-Trend: ${trendProfile.dominantTrend} (trendiness: ${Math.round(trendProfile.trendScore * 100)}%)

═══════════════════════════════════════
WARDROBE INVENTORY (${wardrobeItems.length} items)
═══════════════════════════════════════
${wardrobeBlock}

═══════════════════════════════════════
YOUR TASK — follow exactly
═══════════════════════════════════════

STEP 1 — DEEP DESTINATION ANALYSIS:
Research ${destination} exhaustively for travel dates ${startDate || "upcoming"}:
• WEATHER: exact temperature ranges (day/night), humidity %, precipitation days/month, UV index, wind conditions, any extreme weather risks
• LOCAL FASHION CULTURE: what locals wear, what tourists wear, dress codes for restaurants/temples/offices/beaches
• CURRENT FASHION TRENDS at this destination (reference 2024-2025 trends specific to this region)
• CULTURAL SENSITIVITIES: religious dress requirements, conservative areas, gender-specific norms
• ACTIVITIES & TERRAIN: typical activities, surface types (cobblestones, sand, mountain paths), indoor/outdoor ratio

STEP 2 — WARDROBE CROSS-CHECK (Fashion-Editor Level):
• Match existing items (W-codes) against trip requirements — reference their ACTUAL titles
• Their dominant 2025 aesthetic is "${trendProfile.dominantTrend}" — honour this in every outfit combination
• Identify ALL gaps — especially weather-critical items (rain, extreme cold/heat, UV)
• Apply user's colour preference (${styleProfile.dominantColors[0] ?? "neutral"}-first) to every shopping suggestion
• Apply user's fit preference (${styleProfile.preferredFits[0] ?? "regular"}) to every suggested item
• For each wardrobe match, describe a SPECIFIC editorial outfit (e.g. "Your beige linen shirt layered over the slip dress — very ${trendProfile.dominantTrend}")
• Shopping suggestions must align with their micro-trend aesthetic and use fashion-editor vocabulary

STEP 3 — COLOUR PALETTE CURATION:
• Design a trip-specific colour palette that (a) works for ${destination}'s vibe, (b) aligns with user's ${styleProfile.dominantColors[0] ?? "neutral"} preference, and (c) maximises mix-and-match potential

Return ONLY a valid JSON object. No markdown. No extra text. No trailing commas:
{
  "weatherSummary": "DETAILED: temperature range day & night, humidity, rainfall days, UV, any weather risks",
  "temperatureRange": "e.g. Day: 28-34°C / Night: 22-26°C",
  "humidity": "e.g. 70-85% (tropical, very humid)",
  "rainfallRisk": "none|low|moderate|high|monsoon",
  "uvIndex": "e.g. Very High (8-10) — sunscreen essential",
  "destinationVibe": "fashion culture, local dress code, tourist dress norms",
  "currentTrends": "2-3 specific 2024-2025 fashion trends observed at this destination",

  "styleProfile": {
    "dominantColors": ${JSON.stringify(styleProfile.dominantColors)},
    "description": "${styleProfile.description}",
    "tripColorPalette": ["trip colour 1", "trip colour 2", "trip colour 3"],
    "tripColorReason": "why these colours work for both destination + user's style DNA"
  },

  "culturalNotes": {
    "dressCodes": "specific dress code rules (e.g. cover shoulders in temples)",
    "sensitivities": "cultural or religious sensitivities affecting dress",
    "localStyle": "what fashionable locals are wearing right now"
  },

  "wardrobeMatches": [
    {
      "wardrobeCode": "W1",
      "itemTitle": "exact title from wardrobe",
      "packReason": "specific reason this item works for ${destination}",
      "usageDays": ["Day 1 — travel", "Day 4 — beach evening"],
      "stylingTip": "how to wear/remix it specifically at this destination"
    }
  ],

  "shoppingList": [
    {
      "itemName": "specific item name",
      "category": "Tops|Bottoms|Outerwear|Footwear|Accessories|Dresses|Essentials",
      "priority": "essential|recommended|optional",
      "reason": "why it is needed — be specific to this destination + weather",
      "preferredColor": "colour matching user's ${styleProfile.dominantColors[0] ?? "preferred"} palette",
      "styleSpec": "detailed spec: fit, cut, material, specific style features",
      "weatherReason": "null OR specific weather condition making this essential",
      "estimatedPrice": "e.g. $20-40 mid-range"
    }
  ],

  "packingList": {
    "tops": ["W2 — Navy Tee (owned, Day 1-2) OR new: White linen shirt"],
    "bottoms": ["..."],
    "dresses": ["..."],
    "outerwear": ["..."],
    "footwear": ["..."],
    "accessories": ["..."],
    "essentials": ["..."]
  },

  "dailyOutfits": [
    {
      "day": 1,
      "type": "Travel/Arrival Day",
      "outfit": "specific head-to-toe look referencing W-codes + new items",
      "wardrobeItemsUsed": ["W1", "W3"],
      "newItemsNeeded": ["Black slim joggers (new)"],
      "weatherNote": "weather condition this outfit addresses",
      "tip": "styling or practical tip for this specific day"
    }
  ],

  "trendInsights": "3 specific 2024-2025 trends relevant to this destination and user's aesthetic",
  "styleNotes": "4 personalised styling tips for this user at this destination",
  "avoidItems": ["specific item — reason why not"],
  "totalOutfits": ${tripDays},
  "packingTip": "personalised tip based on user's bag size (${bagSize || "medium"})",
  "sustainabilityTip": "one eco-conscious packing or fashion tip for this destination"
}`;
}

/* ─── Vision analysis of reference image ─── */
// Uses Gemini Flash as primary (fast, free, reliable). No multi-model chain.
async function analyzeReferenceImage(imageSource: string): Promise<string> {
  const PROMPT = `Analyze this travel/landscape photo and return ONLY a JSON object:
{
  "landscapeType": "mountains|beach|desert|forest|urban|rural|mixed|coastal|island",
  "climate": "tropical|subtropical|temperate|alpine|arctic|arid|mediterranean|continental",
  "terrain": ["specific terrain features like snow peaks, rice terraces, fjords, etc."],
  "architecture": "traditional|modern|colonial|ancient|mediterranean|none",
  "waterFeatures": "none|lake|river|ocean|waterfall|glacier",
  "vegetation": "none|sparse|lush tropical|pine forest|alpine meadow|desert scrub",
  "mood": "adventurous|peaceful|romantic|cultural|spiritual|vibrant|remote|luxurious",
  "colorPalette": ["dominant colour 1", "colour 2", "colour 3"],
  "similarRegions": ["3-4 world regions with similar landscape/vibe"],
  "estimatedSeason": "Spring|Summer|Autumn|Winter",
  "uniqueFeatures": "what makes this landscape distinctive (1 sentence)"
}`;

  // ── 1. Ollama local model (no API key, no rate limits) ──
  console.log("[trip/vision] Trying Ollama local model…");
  const ollamaRaw = await ollamaVision(PROMPT, imageSource, 500);
  if (ollamaRaw?.trim()) {
    console.log("[trip/vision] Ollama succeeded");
    return ollamaRaw.trim();
  }

  // ── 2. Gemini Flash (primary API) ──
  if (geminiEnabled) {
    console.log("[trip/vision] Trying Gemini Flash…");
    const raw = await geminiVision(PROMPT, imageSource, 500);
    if (raw?.trim()) {
      console.log("[trip/vision] Gemini Flash succeeded");
      return raw.trim();
    }
    console.warn("[trip/vision] Gemini returned null — falling back to OpenRouter chain…");
  }

  // ── 3. OpenRouter fallback chain ──
  let lastErr: any;
  for (const model of VISION_MODELS) {
    if (!isModelHealthy(model)) {
      console.log(`[trip/vision] Skipping unhealthy model: ${model}`);
      continue;
    }
    try {
      const { data } = await orClient.post("/v1/chat/completions", {
        model,
        messages: [{ role: "user", content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: imageSource } },
        ]}],
        max_tokens: 500, temperature: 0.2,
      });
      const raw = data?.choices?.[0]?.message?.content?.trim() ?? "";
      if (raw) {
        markModelHealthy(model);
        return raw;
      }
      lastErr = new Error("Empty response");
    } catch (e: any) {
      lastErr = e;
      const status = e?.response?.status ?? e?.status;
      const msg = errStr(e).toLowerCase();
      const shouldContinue =
        status === 400 || status === 404 || status === 429 || status === 503 ||
        msg.includes("no endpoints") || msg.includes("not a valid model") ||
        msg.includes("rate-limited") || msg.includes("rate limit") ||
        msg.includes("image") || msg.includes("temporarily") || msg.includes("unavailable");
      if (shouldContinue) {
        markModelFailed(model, status, msg);
        console.warn(`[trip/vision] ${model} skipped (${status ?? msg.slice(0, 40)})`);
        continue;
      }
      break;
    }
  }

  throw lastErr ?? new Error("All vision models failed for image analysis.");
}

/* ─── Discovery prompt builder ─── */
function buildDiscoveryPrompt(
  vibe: string, duration: string, travelers: string, departureCity: string,
  interests: string[], imageAnalysis: string | null, budgetClass: string
) {
  const TODAY = new Date().toISOString().split("T")[0];
  const imageContext = imageAnalysis
    ? `\nREFERENCE PLACE ANALYSIS (user uploaded a photo of their dream destination):\n${imageAnalysis}\n→ Find destinations worldwide with similar landscape, climate, mood, and visual characteristics.`
    : "";

  return `You are an elite AI travel consultant and destination expert. Today is ${TODAY}.

USER TRAVEL PREFERENCES:
- Vibe/Description: "${vibe}"
- Trip Duration: ${duration || "5-10 days"}
- Travelers: ${travelers || "1 person (solo)"}
- Departure City: ${departureCity || "India (major city)"}
- Interests: ${interests.length > 0 ? interests.join(", ") : "mixed (culture, nature, food, adventure)"}
- Budget Class: ${budgetClass || "all tiers"}
${imageContext}

YOUR TASK: Suggest 4 highly personalised destination recommendations based on the above. For each destination:
1. Research current conditions, entry requirements, local highlights
2. Calculate REALISTIC budget breakdowns for 3 user types
3. Identify the top attractions and hidden gems
4. Consider seasonality — suggest best time if current dates are not ideal
5. Factor in flight connectivity from ${departureCity || "India"}

Return ONLY a valid JSON object (no markdown, no extra text):
{
  "imageInsight": ${imageAnalysis ? '"1-sentence description of what the reference photo shows and how you matched destinations to it"' : "null"},
  "destinations": [
    {
      "name": "City/Region name",
      "country": "Country",
      "continent": "Asia|Europe|Americas|Africa|Oceania|Middle East",
      "tagline": "One exciting line capturing its essence",
      "matchReason": "Why this matches the user's vibe/reference image (2-3 specific sentences)",
      "matchScore": 92,
      "wikiSearchTerm": "exact Wikipedia article title for this place (e.g. Interlaken or Amalfi Coast)",
      "unsplashQuery": "2-3 word image search query (e.g. Amalfi coast village)",

      "geography": {
        "landscape": "mountains|beach|forest|urban|desert|island|mixed",
        "terrain": "description of terrain",
        "nearestAirport": "Airport name + IATA code"
      },

      "weather": {
        "currentSeason": "what season it is there now",
        "temperature": "Day X°C / Night Y°C range",
        "humidity": "percentage + descriptor",
        "rainfall": "description + mm/month",
        "bestMonths": ["Month1", "Month2", "Month3"],
        "currentMonthSuitability": "excellent|good|fair|poor",
        "weatherWarning": "null OR specific weather risk (monsoon, hurricane season, extreme heat)"
      },

      "topAttractions": [
        { "name": "Attraction name", "type": "nature|culture|food|adventure|shopping|spiritual", "description": "1 sentence", "entryFee": "Free|$X|varies" }
      ],

      "hiddenGem": "One lesser-known spot locals love",
      "localCuisine": ["must-try dish 1", "must-try dish 2", "must-try dish 3"],
      "localFashionCulture": "what tourists should wear, dress code notes, any cultural sensitivities",

      "idealDuration": "e.g. 5-7 days",
      "flightEstimate": {
        "from": "${departureCity || "India"}",
        "budget": "e.g. $300-500 (economy, advance booking)",
        "premium": "e.g. $900-1400 (business class)"
      },

      "budget": {
        "backpacker": {
          "perDayUSD": 0,
          "accommodation": "hostel or budget guesthouse — name a specific type and price",
          "food": "daily food budget",
          "localTransport": "daily transport cost",
          "activities": "typical activity cost",
          "totalTripUSD": "total for ${duration || "7 days"} person",
          "tips": "specific money-saving tips for this destination"
        },
        "average": {
          "perDayUSD": 0,
          "accommodation": "3-star hotel or boutique — price range",
          "food": "daily food budget at mid-range restaurants",
          "localTransport": "daily transport including tours",
          "activities": "popular paid attractions",
          "totalTripUSD": "total for ${duration || "7 days"} per person",
          "tips": "best value experiences"
        },
        "luxury": {
          "perDayUSD": 0,
          "accommodation": "5-star or iconic property — name examples",
          "food": "fine dining and curated experiences",
          "localTransport": "private transfers and charters",
          "activities": "exclusive experiences and private tours",
          "totalTripUSD": "total for ${duration || "7 days"} per person",
          "tips": "what makes this destination special for luxury travelers"
        }
      },

      "safetyRating": "Very Safe|Safe|Generally Safe|Use Caution|Exercise High Caution",
      "safetyNotes": "specific safety advice for this destination",
      "visaInfo": "visa requirements for Indian passport (most common case) — be specific",
      "bestFor": ["solo", "couple", "family", "group", "adventure", "relaxation", "culture", "food"],
      "notIdealFor": ["who should avoid this destination"],

      "fashionAdvice": {
        "mustPackItems": ["specific item for this destination's climate/culture"],
        "avoidBringing": ["item to leave behind"],
        "shoppingHighlight": "what fashion/textiles to buy there"
      },

      "funFact": "One surprising or little-known fact about this destination"
    }
  ],

  "travelTips": ["3-4 general tips for trips like this"],
  "packingPhilosophy": "one-sentence packing philosophy for this type of trip"
}

CRITICAL RULES — follow every one:
1. Budget numbers MUST be REAL 2024-2025 prices. Backpacker: $20-60/day. Mid-range: $80-200/day. Luxury: $300-1000+/day. Never say "varies" — always give a specific USD number.
2. Name ACTUAL specific hotels (e.g. "The Blue Elephant Guesthouse ~$15/night"), restaurants, and attractions — not just types.
3. Each of the 4 destinations MUST be on different continents or radically different vibes (e.g. one Asia, one Europe, one Americas/Africa/Oceania, one wildcard).
4. visaInfo MUST mention: e-visa/visa-on-arrival/free/Schengen, cost in USD, and duration — for Indian passport holders specifically.
5. Flights from India: economy round-trip to nearby Asia $150-400, SE Asia $250-600, Europe $600-1200, Americas $900-1800, Africa $700-1400. Be accurate.
6. flightEstimate.budget and flightEstimate.premium must be ROUND-TRIP totals in USD.
7. topAttractions must have 4-5 real attractions with actual entry fees (e.g. "Eiffel Tower — €29.40").
8. Match the reference photo analysis very closely if provided.`;
}

/* ─── Normalize AI discover response → frontend DiscoverDestination shape ─── */
function normalizeSafetyRating(raw: string | number): number {
  if (typeof raw === "number") return Math.min(5, Math.max(1, Math.round(raw)));
  const map: Record<string, number> = {
    "very safe": 5, "safe": 4, "generally safe": 3, "use caution": 2,
    "exercise high caution": 1, "high caution": 1, "caution": 2,
  };
  return map[String(raw).toLowerCase()] ?? 3;
}

function normalizeDestination(raw: any, wikiDescription: string | null, imageUrl: string): any {
  const budget = raw.budget ?? {};

  const tiers = ["backpacker", "average", "luxury"] as const;
  const budgets = tiers.map((tier) => {
    const b = budget[tier] ?? {};
    const perDay = b.perDayUSD ?? b.dailyCost ?? "";
    return {
      tier,
      dailyCost: typeof perDay === "number" ? `$${perDay}` : String(perDay || "—"),
      totalEstimate: b.totalTripUSD ?? b.totalEstimate ?? "—",
      accommodation: b.accommodation ?? "—",
      food: b.food ?? "—",
      transport: b.localTransport ?? b.transport ?? "—",
      activities: b.activities ?? "—",
      currency: "USD",
      tips: b.tips ?? "",
    };
  });

  const w = raw.weather ?? {};
  const weather = {
    temperature: w.temperature ?? "—",
    humidity: w.humidity ?? "—",
    rainfall: w.rainfall ?? w.precipitation ?? "—",
    uvIndex: w.uvIndex ?? w.uv ?? "Moderate",
    bestMonths: w.bestMonths ?? [],
    currentSeason: w.currentSeason ?? "—",
    clothing: raw.localFashionCulture ?? w.clothing ?? "",
  };

  const rawAttractions = raw.topAttractions ?? raw.attractions ?? [];
  const attractions = rawAttractions.map((a: any, i: number) => ({
    name: a.name ?? "—",
    type: a.type ?? "culture",
    description: a.description ?? "",
    mustSee: i < 2 || a.mustSee === true,
  }));

  const fashionAdvice = raw.fashionAdvice
    ? (Array.isArray(raw.fashionAdvice.mustPackItems)
        ? `Pack: ${raw.fashionAdvice.mustPackItems.join(", ")}. ` : "")
      + (raw.fashionAdvice.shoppingHighlight ? `Shop: ${raw.fashionAdvice.shoppingHighlight}` : "")
    : "";

  const matchReasons = Array.isArray(raw.matchReasons)
    ? raw.matchReasons
    : raw.matchReason
    ? [raw.matchReason]
    : [];

  return {
    name: raw.name ?? "—",
    country: raw.country ?? "—",
    region: raw.continent ?? raw.region ?? "—",
    tagline: raw.tagline ?? "",
    matchScore: raw.matchScore ?? 80,
    matchReasons,
    imageUrl,
    wikiDescription: wikiDescription ?? "",
    weather,
    budgets,
    attractions,
    visaInfo: raw.visaInfo ?? "",
    safetyRating: normalizeSafetyRating(raw.safetyRating ?? 3),
    safetyNotes: raw.safetyNotes ?? "",
    fashionAdvice,
    culturalDressCodes: raw.localFashionCulture ?? "",
    sustainabilityTips: raw.sustainabilityTips ?? "",
    languages: raw.languages ?? [],
    bestFor: raw.bestFor ?? [],
    landscape: raw.geography?.landscape ?? raw.landscape ?? "",
  };
}

/* ─── Zod schemas ─── */
const PlanBody = z.object({
  destination: z.string().min(2),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  bagType: z.string().optional(),
  bagSize: z.string().optional(),
  bagNotes: z.string().optional(),
  includeWardrobe: z.boolean().optional().default(true),
  savePlan: z.boolean().optional().default(false),
});

const DiscoverBody = z.object({
  vibe: z.string().optional().default(""),
  duration: z.string().optional(),
  travelers: z.string().optional(),
  departureCity: z.string().optional(),
  interests: z.array(z.string()).optional().default([]),
  budgetClass: z.enum(["all", "backpacker", "average", "luxury"]).optional().default("all"),
  imageUrl: z.string().url().optional(),
});

/* ═══════════════════════════════════════════════════════════
   POST /trip/plan  — wardrobe-aware trip planning
═══════════════════════════════════════════════════════════ */
router.post("/plan", requireAuth, async (req, res) => {
  if (!groqEnabled && !geminiEnabled)
    return res.status(500).json({ error: "No AI provider configured — add GROQ_API_KEY or GEMINI_API_KEY to backend/.env" });

  const parsed = PlanBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { destination, startDate, endDate, bagType, bagSize, bagNotes, savePlan } = parsed.data;

  let tripDays = 5;
  if (startDate && endDate) {
    const diff = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000);
    tripDays = Math.max(1, Math.min(diff, 30));
  }

  const bookingLinks = buildBookingLinks(destination, startDate, endDate);

  // Fetch real weather in parallel with wardrobe
  const realWeatherPromise = fetchRealWeather(destination);

  /* fetch wardrobe — auto-approve any unapproved items first so trip sees full wardrobe */
  let wardrobeItems: WardrobeItem[] = [];
  let styleProfile = buildStyleProfile([]);
  try {
    await prisma.item.updateMany({
      where: { ownerId: req.auth!.sub, approved: false },
      data: { approved: true },
    }).catch(() => {});

    const dbItems = await prisma.item.findMany({
      where: { ownerId: req.auth!.sub, archived: false },
      select: { id: true, title: true, section: true, color: true, material: true, texture: true,
        pattern: true, fit: true, silhouette: true, styleEra: true, occasion: true,
        season: true, styleTags: true, deepSummary: true, microTrend: true },
      take: 300,  // raised from 50 — send full wardrobe to AI
    });
    wardrobeItems = dbItems as unknown as WardrobeItem[];
    styleProfile = buildStyleProfile(wardrobeItems);
  } catch { /* continue without wardrobe */ }

  /* mock */
  if (process.env.MOCK_AI === "true") {
    return res.json({ plan: { weatherSummary: `${destination} mock weather`, temperatureRange: "20-30°C", humidity: "60%", rainfallRisk: "low", uvIndex: "High", destinationVibe: "Smart casual", currentTrends: "Quiet luxury dominates", styleProfile: { dominantColors: styleProfile.dominantColors, description: styleProfile.description, tripColorPalette: ["black", "white", "olive"], tripColorReason: "Neutrals work best." }, culturalNotes: { dressCodes: "No strict rules", sensitivities: "None", localStyle: "Smart casual" }, wardrobeMatches: [], shoppingList: [{ itemName: "Lightweight jacket", category: "Outerwear", priority: "recommended", reason: "Evenings cool down", preferredColor: "black", styleSpec: "Slim fit bomber", weatherReason: null, estimatedPrice: "$30-60" }], packingList: { tops: ["White tee"], bottoms: ["Black jeans"], dresses: [], outerwear: ["Light jacket"], footwear: ["Sneakers"], accessories: ["Sunglasses"], essentials: ["Sunscreen"] }, dailyOutfits: [{ day: 1, type: "Travel Day", outfit: "Black jeans + white tee + sneakers", wardrobeItemsUsed: [], newItemsNeeded: [], weatherNote: "Clear skies", tip: "Travel light" }], trendInsights: "Coastal minimalism is trending.", styleNotes: "Stick to your black palette.", avoidItems: ["Heavy denim"], totalOutfits: tripDays, packingTip: "Roll don't fold.", sustainabilityTip: "Pack a reusable bag." }, styleProfile, bookingLinks, model: "mock" });
  }

  try {
    const [trendProfile, realWeather] = await Promise.all([
      Promise.resolve(buildTrendProfile(wardrobeItems)),
      realWeatherPromise,
    ]);

    // If real weather is available, prepend it to the AI prompt for accuracy
    const weatherContext = realWeather
      ? `\n\nCURRENT LIVE WEATHER at ${realWeather.city}, ${realWeather.country} (from OpenWeatherMap):
- Temperature: ${realWeather.temperature} (feels like ${realWeather.feelsLike})
- Humidity: ${realWeather.humidity}
- Conditions: ${realWeather.description}
- Wind: ${realWeather.windSpeed}
Use this ACTUAL current weather data when describing weather conditions and clothing advice.\n`
      : "";

    const prompt = weatherContext + buildSmartTripPrompt(destination, startDate, endDate, bagType, bagSize, bagNotes, tripDays, wardrobeItems, styleProfile);
    const TRIP_SYSTEM = `You are GENIE — a world-class personal travel stylist and fashion consultant with the taste of a Vogue editor and the precision of a seasoned travel writer.
You know this user's wardrobe intimately — their dominant aesthetic is ${trendProfile.dominantTrend} (${Math.round(trendProfile.trendScore * 100)}% 2025 trendiness score).
Your job: give SPECIFIC, OPINIONATED packing advice using their ACTUAL wardrobe items (referenced by their W-codes).
Reference 2025 fashion context: Quiet Luxury, Ballet Core, Dark Feminine, Office Siren, Y2K Revival, Ethnic Couture.
For every daily outfit: name the exact pieces, describe the color story, and explain why it works for that day's activity and local culture.
For weather: use REAL current climate data for the destination and time of year — actual °C ranges, humidity, rainfall.
For shopping list: only suggest items that genuinely fill gaps in their wardrobe for this trip — be specific (e.g. "lightweight linen shirt in ecru — perfect for humid coastal days, pairs with their W3 trousers").
Return ONLY valid JSON exactly as specified. No markdown fences. No extra text. No truncation — complete the FULL JSON.`;

    let raw = "";
    let usedModel = TRIP_GROQ_MODEL;

    // ── 1. Groq 70B (primary — smarter, handles complex JSON reliably) ──
    if (groqEnabled) {
      const groqRaw = await groqChat(TRIP_SYSTEM, prompt, 5000, TRIP_GROQ_MODEL);
      if (groqRaw?.trim()) { raw = groqRaw.trim(); usedModel = TRIP_GROQ_MODEL; }
      else console.warn("[trip/plan] Groq 70B returned empty — trying Gemini…");
    }

    // ── 2. Gemini (fallback — vision already uses it, text-only here) ──
    if (!raw && geminiEnabled) {
      const geminiRaw = await geminiChat(TRIP_SYSTEM, prompt, 5000);
      if (geminiRaw) { raw = geminiRaw; usedModel = "gemini-2.0-flash"; }
    }

    if (!raw) return res.status(502).json({ error: "All AI providers failed for trip plan — check GROQ_API_KEY or GEMINI_API_KEY" });

    const plan = parseJson(raw);
    if (!plan) return res.status(502).json({ error: "Could not parse AI response", raw: raw.slice(0, 600) });

    plan.bookingLinks = bookingLinks;

    // Attach wardrobe item IDs to matches
    if (plan.wardrobeMatches?.length && wardrobeItems.length) {
      plan.wardrobeMatches = plan.wardrobeMatches.map((m: any) => {
        const idx = parseInt((m.wardrobeCode ?? "").replace("W", ""), 10) - 1;
        return { ...m, wardrobeItemId: wardrobeItems[idx]?.id ?? null };
      });
    }

    let savedPlan: any = null;
    if (savePlan) {
      savedPlan = await prisma.tripPlan.create({ data: {
        userId: req.auth!.sub, destination,
        startDate: startDate ?? null, endDate: endDate ?? null,
        bagType: bagType ?? null, bagSize: bagSize ?? null, bagNotes: bagNotes ?? null,
        weatherSummary: plan.weatherSummary ?? null, packingList: plan.packingList ?? {},
        dailyOutfits: plan.dailyOutfits ?? [], styleNotes: plan.styleNotes ?? null,
        avoidItems: Array.isArray(plan.avoidItems) ? plan.avoidItems : [], bookingLinks,
      }});
    }

    return res.json({ plan, styleProfile, bookingLinks, savedPlan, model: usedModel, realWeather: realWeather ?? null });
  } catch (e) {
    console.error("[trip/plan]", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /trip/discover  — AI destination finder
═══════════════════════════════════════════════════════════ */
router.post("/discover", requireAuth, async (req, res) => {
  if (!groqEnabled && !geminiEnabled)
    return res.status(500).json({ error: "No AI provider configured — add GROQ_API_KEY to backend/.env" });

  const parsed = DiscoverBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten().fieldErrors });

  const { vibe, duration, travelers, departureCity, interests, budgetClass, imageUrl } = parsed.data;

  /* mock */
  if (process.env.MOCK_AI === "true") {
    return res.json({ destinations: [{ name: "Interlaken", country: "Switzerland", tagline: "Alpine paradise with crystal lakes", matchScore: 95, matchReason: "Dramatic mountain scenery very similar to your reference.", wikiSearchTerm: "Interlaken", imageUrl: null, weather: { temperature: "Day 18°C / Night 8°C", bestMonths: ["June", "July", "August"] }, budget: { backpacker: { perDayUSD: 60, totalTripUSD: "$420 for 7 days" }, average: { perDayUSD: 180, totalTripUSD: "$1260" }, luxury: { perDayUSD: 600, totalTripUSD: "$4200" } }, topAttractions: [{ name: "Jungfraujoch", type: "nature", description: "Top of Europe", entryFee: "$180" }], idealDuration: "5-7 days", safetyRating: "Very Safe", visaInfo: "Schengen visa required for Indian passport", fashionAdvice: { mustPackItems: ["Warm layers"], avoidBringing: ["Sandals in winter"] } }], model: "mock" });
  }

  try {
    /* optional image analysis */
    let imageAnalysis: string | null = null;
    if (imageUrl) {
      try {
        imageAnalysis = await withRetry(() => analyzeReferenceImage(imageUrl));
      } catch (e) {
        console.warn("[discover] Image analysis failed:", errStr(e));
      }
    }

    const prompt = buildDiscoveryPrompt(vibe, duration ?? "", travelers ?? "", departureCity ?? "", interests, imageAnalysis, budgetClass);
    const DISCOVER_SYSTEM = `You are an elite AI travel consultant with expertise across all continents. You have encyclopedic knowledge of 2024-2025 travel conditions, real hotel/hostel prices, flight costs, and attraction entry fees. Your suggestions are ALWAYS specific, grounded in reality, and include ACTUAL named hotels, restaurants, and landmarks — never vague placeholders. Return ONLY valid JSON exactly as instructed. Never use markdown fences. Never say "varies" — give real numbers.`;

    let rawDiscover = "";
    if (groqEnabled) {
      const g = await groqChat(DISCOVER_SYSTEM, prompt, 5000, TRIP_GROQ_MODEL);
      if (g?.trim()) rawDiscover = g.trim();
      else console.warn("[trip/discover] Groq 70B empty — trying Gemini…");
    }
    if (!rawDiscover && geminiEnabled) {
      const g = await geminiChat(DISCOVER_SYSTEM, prompt, 5000);
      if (g) rawDiscover = g;
    }
    if (!rawDiscover) return res.status(502).json({ error: "All AI providers failed for discover — check GROQ_API_KEY or GEMINI_API_KEY" });

    const raw = rawDiscover;

    const result = parseJson(raw);
    if (!result) return res.status(502).json({ error: "Could not parse AI response", raw: raw.slice(0, 600) });

    /* Fetch Wikipedia images + normalize each destination */
    const enriched = await Promise.allSettled(
      (result.destinations ?? []).map(async (dest: any) => {
        // Pass rich extra keywords → better Commons image match
        const extraKw = [
          dest.country, dest.continent,
          dest.geography?.landscape, dest.geography?.terrain,
          dest.unsplashQuery,
        ].filter(Boolean) as string[];
        const wikiData = await fetchWikiData(dest.wikiSearchTerm ?? dest.name, extraKw);
        const imgUrl = wikiData.imageUrl ?? await unsplashFallback(
          [dest.name, dest.country, dest.geography?.landscape, "travel"].filter(Boolean).join(" ")
        ) ?? `https://via.placeholder.com/800x500/1e1e2e/a855f7?text=${encodeURIComponent(dest.name)}`;
        return normalizeDestination(dest, wikiData.description ?? null, imgUrl);
      })
    );

    const destinations = enriched.map((r) => r.status === "fulfilled" ? r.value : null).filter(Boolean);

    // Build analysisNote from imageInsight + travelTips
    const analysisNote = [
      result.imageInsight,
      result.packingPhilosophy,
    ].filter(Boolean).join(" ") || "Here are destinations matching your vibe and preferences.";

    const vibeKeywords = (result.travelTips ?? [])
      .flatMap((tip: string) => tip.split(/\s+/).filter((w: string) => w.length > 5).slice(0, 2))
      .slice(0, 6);

    return res.json({
      destinations,
      analysisNote,
      vibeKeywords,
      model: GROQ_MODEL_TAG,
    });
  } catch (e) {
    console.error("[trip/discover]", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  }
});

/* ═══════════════════════════════════════════════════════════
   POST /trip/discover/upload  — discover with uploaded reference photo
═══════════════════════════════════════════════════════════ */
router.post("/discover/upload", requireAuth, upload.single("image"), async (req, res) => {
  if (!groqEnabled && !geminiEnabled)
    return res.status(500).json({ error: "No AI provider configured — add GROQ_API_KEY to backend/.env" });

  if (!req.file) return res.status(400).json({ error: "image required" });

  const { vibe, duration, travelers, departureCity, interests: rawInterests, budgetClass } = req.body;
  const interests: string[] = rawInterests ? (Array.isArray(rawInterests) ? rawInterests : [rawInterests]) : [];
  const filePath = req.file.path;

  try {
    /* Convert to base64 data URL */
    const buf = fs.readFileSync(filePath);
    const dataUrl = `data:${req.file.mimetype};base64,${buf.toString("base64")}`;

    let imageAnalysis: string | null = null;
    try {
      imageAnalysis = await withRetry(() => analyzeReferenceImage(dataUrl));
    } catch (e) {
      console.warn("[discover/upload] Image analysis failed:", errStr(e));
    }

    const prompt = buildDiscoveryPrompt(
      vibe || "a beautiful scenic destination",
      duration ?? "", travelers ?? "", departureCity ?? "",
      interests, imageAnalysis, budgetClass ?? "all"
    );

    const UPLOAD_SYSTEM = "You are an elite travel consultant. Return ONLY valid JSON. No markdown fences.";
    let rawUpload = "";
    if (groqEnabled) {
      const g = await groqChat(UPLOAD_SYSTEM, prompt, 5000, TRIP_GROQ_MODEL);
      if (g?.trim()) rawUpload = g.trim();
      else console.warn("[trip/discover/upload] Groq 70B empty — trying Gemini…");
    }
    if (!rawUpload && geminiEnabled) {
      const g = await geminiChat(UPLOAD_SYSTEM, prompt, 5000);
      if (g) rawUpload = g;
    }
    if (!rawUpload) return res.status(502).json({ error: "All AI providers failed for discover/upload — check GROQ_API_KEY or GEMINI_API_KEY" });

    const result = parseJson(rawUpload);
    if (!result) return res.status(502).json({ error: "Could not parse AI response", raw: rawUpload.slice(0, 600) });

    const enriched = await Promise.allSettled(
      (result.destinations ?? []).map(async (dest: any) => {
        const extraKw = [
          dest.country, dest.continent,
          dest.geography?.landscape, dest.geography?.terrain,
          dest.unsplashQuery,
        ].filter(Boolean) as string[];
        const wikiData = await fetchWikiData(dest.wikiSearchTerm ?? dest.name, extraKw);
        const imgUrl = wikiData.imageUrl ?? await unsplashFallback(
          [dest.name, dest.country, dest.geography?.landscape, "travel"].filter(Boolean).join(" ")
        ) ?? `https://via.placeholder.com/800x500/1e1e2e/a855f7?text=${encodeURIComponent(dest.name)}`;
        return normalizeDestination(dest, wikiData.description ?? null, imgUrl);
      })
    );

    const destinations = enriched.map((r) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
    const analysisNote = [result.imageInsight, result.packingPhilosophy].filter(Boolean).join(" ") || "Here are destinations matching your uploaded photo and preferences.";
    const vibeKeywords = (result.travelTips ?? []).flatMap((tip: string) => tip.split(/\s+/).filter((w: string) => w.length > 5).slice(0, 2)).slice(0, 6);

    return res.json({
      destinations,
      analysisNote,
      vibeKeywords,
      model: GROQ_MODEL_TAG,
    });
  } catch (e) {
    console.error("[discover/upload]", errStr(e));
    return res.status(500).json({ error: errStr(e) });
  } finally {
    fs.promises.unlink(filePath).catch(() => {}); // best-effort cleanup, non-blocking
  }
});

/* ─── GET /trip/plans ─── */
router.get("/plans", requireAuth, async (req, res) => {
  try {
    const plans = await prisma.tripPlan.findMany({ where: { userId: req.auth!.sub }, orderBy: { createdAt: "desc" }, take: 20 });
    return res.json({ plans });
  } catch (e) { return res.status(500).json({ error: errStr(e) }); }
});

/* ─── GET /trip/plans/:id ─── */
router.get("/plans/:id", requireAuth, async (req, res) => {
  try {
    const plan = await prisma.tripPlan.findFirst({ where: { id: req.params.id, userId: req.auth!.sub } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    return res.json({ plan });
  } catch (e) { return res.status(500).json({ error: errStr(e) }); }
});

/* ─── DELETE /trip/plans/:id ─── */
router.delete("/plans/:id", requireAuth, async (req, res) => {
  try {
    await prisma.tripPlan.deleteMany({ where: { id: req.params.id, userId: req.auth!.sub } });
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: errStr(e) }); }
});

/* ─── PATCH /trip/plans/:id/checklist — Feature 14: Packing checklist ─── */
router.patch("/plans/:id/checklist", requireAuth, async (req, res) => {
  const { checkedItems } = req.body;
  if (!Array.isArray(checkedItems)) return res.status(400).json({ error: "checkedItems must be an array" });
  try {
    const plan = await prisma.tripPlan.findFirst({ where: { id: req.params.id, userId: req.auth!.sub } });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    const updated = await (prisma.tripPlan.update as any)({
      where: { id: req.params.id },
      data: { checkedItems },
    });
    return res.json({ plan: updated });
  } catch (e) { return res.status(500).json({ error: errStr(e) }); }
});

export default router;
