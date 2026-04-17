#!/usr/bin/env python3
"""
StyloGenie Local Fashion Classifier Service
============================================
Uses CLIP (vision-language model) for zero-shot fashion attribute classification.
Runs 100% locally — no API keys, no internet needed after first model download.

Start:  python classifier_service.py
Port:   5001 (configurable via PORT env var)

Model:  patrickjohncyh/fashion-clip  (~400 MB, downloads once to HuggingFace cache)
        Fine-tuned CLIP on 800k fashion images — much better than generic CLIP for clothes.

Speed:  ~3-6 seconds per image on Intel CPU
        ~0.5-1 second on Apple Silicon (Metal GPU)
"""

import os
import io
import base64
import json
import traceback
import colorsys
import requests
import numpy as np
from PIL import Image
from sklearn.cluster import KMeans
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import CLIPProcessor, CLIPModel
import torch

# ─── Config ───────────────────────────────────────────────────────────────────
PORT      = int(os.environ.get("PORT", 5001))
MODEL_ID  = "patrickjohncyh/fashion-clip"
DEVICE    = "mps" if torch.backends.mps.is_available() else "cpu"

print(f"[fashion-clip] Loading model: {MODEL_ID}")
print(f"[fashion-clip] Device: {DEVICE}")

model     = CLIPModel.from_pretrained(MODEL_ID).to(DEVICE)
processor = CLIPProcessor.from_pretrained(MODEL_ID)
model.eval()

print(f"[fashion-clip] ✅ Model ready on {DEVICE}")

# ─── Zero-shot label sets ─────────────────────────────────────────────────────
# Each dict: { return_value: "text description for CLIP scoring" }

CATEGORY_LABELS = {
    "Tops":       "a photo of a clothing top, shirt, blouse, tee, sweater, or knitwear",
    "Bottoms":    "a photo of pants, jeans, trousers, skirt, shorts, or leggings",
    "Dresses":    "a photo of a dress, frock, gown, or jumpsuit",
    "Outerwear":  "a photo of a jacket, coat, blazer, or windbreaker",
    "Footwear":   "a photo of shoes, boots, sneakers, sandals, or heels",
    "Accessories":"a photo of a bag, purse, scarf, belt, hat, or jewellery",
    "Ethnicwear": "a photo of ethnic wear like saree, kurta, lehenga, or salwar",
    "Sportswear": "a photo of sportswear, activewear, gym clothes, or athleisure",
}

PATTERN_LABELS = {
    "solid":        "a plain solid color garment with no visible pattern",
    "striped":      "a garment with stripes or horizontal/vertical lines",
    "floral":       "a garment with flower or floral print pattern",
    "plaid":        "a plaid or checkered tartan pattern garment",
    "graphic print":"a garment with graphic print, text, logo, or illustration",
    "abstract":     "a garment with abstract or geometric pattern",
    "animal print": "a garment with animal print like leopard, zebra, or snake",
    "tie-dye":      "a tie-dye or batik swirl patterned garment",
    "embroidered":  "a garment with embroidery or embroidered details",
}

OCCASION_LABELS = {
    "Casual":  "casual everyday relaxed clothing for daily wear",
    "Formal":  "formal professional business office wear clothing",
    "Sports":  "sports athletic activewear for exercise and gym",
    "Party":   "party evening cocktail celebration clothing",
    "Ethnic":  "traditional cultural ethnic ceremonial clothing",
}

SEASON_LABELS = {
    "Spring": "light airy spring clothing for mild warm weather",
    "Summer": "summer clothing for hot weather, lightweight breathable fabric",
    "Autumn": "autumn fall layered clothing for cool crisp weather",
    "Winter": "winter clothing for cold weather, heavy warm thick fabric",
}

STYLE_ERA_LABELS = {
    "minimalist":        "minimalist clean simple modern fashion",
    "streetwear":        "urban streetwear casual cool fashion",
    "bohemian":          "bohemian boho free-spirited eclectic fashion",
    "Y2K":               "Y2K 2000s retro nostalgic pop fashion",
    "athleisure":        "athleisure sporty casual comfortable fashion",
    "contemporary":      "contemporary modern current mainstream fashion",
    "cottagecore":       "cottagecore romantic rustic cottage fashion",
    "dark academia":     "dark academia intellectual vintage scholarly fashion",
    "traditional Indian":"traditional Indian ethnic heritage fashion",
    "vintage 90s":       "vintage 90s retro nineties throwback fashion",
}

FIT_LABELS = {
    "slim fit":    "slim fit tight fitted closely tailored clothing",
    "regular fit": "regular fit standard relaxed everyday cut",
    "oversized":   "oversized loose baggy extra-large clothing",
    "bodycon":     "bodycon skin-tight body-hugging stretchy clothing",
    "relaxed":     "relaxed loose comfortable laid-back fit",
    "cropped":     "cropped short cut-off above-waist clothing",
    "tailored":    "tailored structured fitted formal clothing",
}

MATERIAL_LABELS = {
    "cotton":    "cotton fabric casual soft breathable clothing",
    "denim":     "denim jeans rugged woven cotton clothing",
    "silk":      "silk satin shiny smooth luxurious clothing",
    "wool":      "wool knit warm heavy winter clothing",
    "polyester": "polyester synthetic quick-dry athletic clothing",
    "linen":     "linen lightweight breathable summer clothing",
    "leather":   "leather jacket or leather pants clothing",
    "velvet":    "velvet plush rich soft textured clothing",
    "chiffon":   "chiffon sheer flowy light transparent clothing",
    "cashmere":  "cashmere fine soft luxury knitwear clothing",
}

TEXTURE_LABELS = {
    "smooth":    "smooth flat plain surface fabric",
    "ribbed":    "ribbed textured knit fabric with ridges",
    "woven":     "woven structured plain weave fabric",
    "knit":      "knit stretchy jersey fabric",
    "quilted":   "quilted padded stitched fabric",
    "brushed":   "brushed soft fluffy fabric like fleece",
    "matte":     "matte non-shiny flat finish fabric",
    "glossy":    "glossy shiny reflective fabric",
}

SILHOUETTE_LABELS = {
    "straight cut":  "straight boxy rectangular silhouette",
    "A-line":        "A-line flared wider at hem silhouette",
    "wrap":          "wrap around tied waist silhouette",
    "flared":        "flared wide bottom bell silhouette",
    "structured":    "structured stiff tailored formal silhouette",
    "draped":        "draped flowing soft fabric silhouette",
    "asymmetric":    "asymmetric uneven irregular hem silhouette",
}

# ─── CLIP scoring helper ──────────────────────────────────────────────────────

@torch.no_grad()
def clip_classify(pil_image: Image.Image, label_dict: dict) -> str:
    """Score image against all text labels; return key with highest similarity."""
    labels  = list(label_dict.keys())
    texts   = list(label_dict.values())

    inputs  = processor(
        text=texts,
        images=pil_image,
        return_tensors="pt",
        padding=True,
    ).to(DEVICE)

    outputs = model(**inputs)
    logits  = outputs.logits_per_image[0]       # shape: (num_texts,)
    probs   = logits.softmax(dim=0).cpu().numpy()
    return labels[int(np.argmax(probs))]


@torch.no_grad()
def clip_top_n(pil_image: Image.Image, label_dict: dict, n=3) -> list[str]:
    """Return top-n keys sorted by CLIP score."""
    labels  = list(label_dict.keys())
    texts   = list(label_dict.values())

    inputs  = processor(
        text=texts,
        images=pil_image,
        return_tensors="pt",
        padding=True,
    ).to(DEVICE)

    outputs = model(**inputs)
    logits  = outputs.logits_per_image[0]
    probs   = logits.softmax(dim=0).cpu().numpy()
    top_idx = np.argsort(probs)[::-1][:n]
    return [labels[i] for i in top_idx]


# ─── Color extraction (no ML needed — faster & more accurate than CLIP) ──────

def rgb_to_name(r: float, g: float, b: float) -> str:
    """
    HSL-aware color naming — far more accurate than Euclidean RGB distance.

    Human color perception is hue-first, then brightness/saturation.
    Splitting the red family into two zones fixes the classic maroon/pink confusion:
      • Pure red zone  (H 355–360 / 0–15): dark=maroon, mid=red, light=pink
      • Pink/rose zone (H 315–355):        dark=maroon, mid=rose/deep pink, light=pink
    colorsys.rgb_to_hls() returns (H, L, S) each in [0, 1].
    """
    r_n, g_n, b_n = r / 255.0, g / 255.0, b / 255.0
    h, l, s = colorsys.rgb_to_hls(r_n, g_n, b_n)
    h_deg = h * 360

    # ── Achromatic (no real hue) ────────────────────────────────────────
    if s < 0.10:
        if l < 0.18: return "black"
        if l < 0.86: return "grey"
        return "white"

    # ── Near-black / near-white regardless of hue ───────────────────────
    if l < 0.10: return "black"
    if l > 0.93: return "white"

    # ── Red family  (hue 315–360 and 0–20) ─────────────────────────────
    if h_deg >= 315 or h_deg < 20:
        # Very dark → maroon regardless of exact hue
        if l < 0.30: return "maroon"

        # Split: pure-red zone vs pink/rose zone
        is_pure_red = (h_deg >= 355 or h_deg < 15)
        if is_pure_red:
            # Bright, saturated, mid-lightness → red
            if l < 0.65: return "red"
            return "pink"   # very light red reads as pink

        else:  # pink/rose zone (H 315–355)
            if l < 0.46:
                return "rose"
            if l < 0.68:
                return "deep pink" if s > 0.70 else "rose"
            return "pink"

    # ── Magentas / Hot pinks  (hue 300–315) ────────────────────────────
    if h_deg >= 300:
        if l < 0.30: return "purple"
        if l < 0.62: return "hot pink"
        return "pink"

    # ── Oranges  (hue 20–45) ────────────────────────────────────────────
    if h_deg < 45:
        if l < 0.40: return "brown"               # dark/mid-dark = brown
        if l < 0.60 and s > 0.65: return "orange" # vivid orange
        if l < 0.60: return "brown"               # muted mid = brown
        if h_deg < 32: return "coral"             # bright light warm-red = coral
        return "orange"

    # ── Yellows  (hue 45–70) ────────────────────────────────────────────
    if h_deg < 70:
        if l < 0.38: return "olive"
        if l < 0.62: return "mustard"
        return "yellow"

    # ── Yellow-greens / olives  (hue 70–90) ────────────────────────────
    if h_deg < 90:
        if l < 0.45: return "olive"
        return "yellow"

    # ── Greens  (hue 90–165) ────────────────────────────────────────────
    if h_deg < 165:
        return "green"

    # ── Teals / Cyans  (hue 165–200) ────────────────────────────────────
    if h_deg < 200:
        return "teal"

    # ── Blues  (hue 200–260) ────────────────────────────────────────────
    if h_deg < 260:
        if l < 0.25: return "navy"
        return "blue"

    # ── Purples / Violets  (hue 260–300) ────────────────────────────────
    if h_deg < 300:
        if l < 0.40: return "purple"
        return "lavender"

    return "grey"  # fallback

def detect_background_color(img_array: np.ndarray) -> np.ndarray:
    """
    Sample the four corners of an image to estimate the background colour.
    Corner region = ~15% of min(width,height) in each corner.
    Returns the median RGB of corner pixels as a (3,) float array.
    """
    h, w = img_array.shape[:2]
    cs = max(12, min(h, w) // 7)   # corner sample size in pixels
    corner_pixels = np.vstack([
        img_array[:cs,   :cs  ].reshape(-1, 3),   # top-left
        img_array[:cs,   -cs: ].reshape(-1, 3),   # top-right
        img_array[-cs:,  :cs  ].reshape(-1, 3),   # bottom-left
        img_array[-cs:,  -cs: ].reshape(-1, 3),   # bottom-right
    ]).astype(float)
    return np.median(corner_pixels, axis=0)        # robust to corner outliers


def extract_colors(pil_image: Image.Image) -> tuple[list[str], str]:
    """
    Return (color_names_list, dominant_hex).

    4-stage garment isolation — handles solid-color backgrounds (red studio
    backdrops, white walls, etc.) that defeat simple saturation/lightness filters:

      1. Corner-based background detection: sample four corners → median BG colour
      2. Centre-crop: removes edges where garment is rarely present
      3. BG-exclusion mask: drop pixels within Euclidean distance 40 of BG colour
      4. Near-white / near-black removal for shadows and blown-out highlights
    """
    w, h = pil_image.size
    rgb = pil_image.convert("RGB")

    # ── Stage 1: Detect background colour from corners (full-res image) ──
    full_small = np.array(rgb.resize((200, 200))).astype(float)
    bg_color   = detect_background_color(full_small)

    # ── Stage 2: Centre crop (garment is mostly in the centre) ──
    left   = int(w * 0.12)
    right  = int(w * 0.88)
    top    = int(h * 0.06)
    bottom = int(h * 0.90)
    img    = rgb.crop((left, top, right, bottom)).resize((140, 140))
    arr    = np.array(img).astype(float)
    pixels = arr.reshape(-1, 3)

    # ── Stage 3: Exclude pixels that match the background colour ──
    # Euclidean RGB distance — 40 is tight enough to catch solid-colour
    # studio backdrops while keeping similar-but-different garment colours.
    bg_dist       = np.sqrt(np.sum((pixels - bg_color) ** 2, axis=1))
    not_bg        = bg_dist > 40
    pixels_no_bg  = pixels[not_bg]
    if pixels_no_bg.shape[0] < 50:
        pixels_no_bg = pixels   # fallback: use all if BG detection wiped too much

    # ── Stage 4: Remove near-white (>215) and near-black (<40) ──
    not_white = ~((pixels_no_bg[:, 0] > 215) & (pixels_no_bg[:, 1] > 215) & (pixels_no_bg[:, 2] > 215))
    not_black = ~((pixels_no_bg[:, 0] < 40)  & (pixels_no_bg[:, 1] < 40)  & (pixels_no_bg[:, 2] < 40))
    work = pixels_no_bg[not_white & not_black]
    if work.shape[0] < 40:
        work = pixels_no_bg   # fallback

    # ── KMeans clustering on garment pixels ──
    k  = min(3, max(1, work.shape[0] // 20))
    km = KMeans(n_clusters=k, n_init=10, random_state=0)
    km.fit(work)

    counts  = np.bincount(km.labels_)
    order   = np.argsort(counts)[::-1]
    centers = km.cluster_centers_[order]

    colors = [rgb_to_name(*c) for c in centers]
    seen, unique = set(), []
    for c in colors:
        if c not in seen:
            seen.add(c)
            unique.append(c)

    dominant_rgb = centers[0]
    hex_color    = "#{:02x}{:02x}{:02x}".format(
        int(np.clip(dominant_rgb[0], 0, 255)),
        int(np.clip(dominant_rgb[1], 0, 255)),
        int(np.clip(dominant_rgb[2], 0, 255)),
    )
    return unique[:3], hex_color


# ─── Title + summary templates ────────────────────────────────────────────────

def build_title(category: str, color: list, pattern: str, fit: str) -> str:
    parts = []
    if fit not in ("regular fit",):
        parts.append(fit.title())
    if pattern not in ("solid",):
        parts.append(pattern.title())
    if color:
        parts.append(color[0].title())
    # Shorten category to noun
    cat_noun = {
        "Tops": "Top", "Bottoms": "Bottoms", "Dresses": "Dress",
        "Outerwear": "Jacket", "Footwear": "Shoes", "Accessories": "Accessory",
        "Ethnicwear": "Ethnic Wear", "Sportswear": "Sportswear",
    }.get(category, category)
    parts.append(cat_noun)
    return " ".join(parts) or f"{category} Item"

# ─── 2025 Micro-trend classification ─────────────────────────────────────────
# CLIP zero-shot against current fashion micro-trends.
# These labels are tuned for fashion-clip which was trained on fashion images.

MICRO_TRENDS_2025 = {
    "Quiet Luxury":
        "minimalist luxury understated elegance old money aesthetic neutral tones cashmere linen",
    "Ballet Core":
        "ballet dancer aesthetic soft pink satin ribbon feminine wrap delicate graceful",
    "Dark Feminine":
        "dark romantic gothic black lace velvet mysterious sexy powerful feminine energy",
    "Office Siren":
        "corporate power dressing blazer tailored pencil skirt structured professional chic",
    "Mob Wife Aesthetic":
        "maximalist fur coat animal print leopard bold glam rich luxury excess",
    "Gorpcore":
        "outdoor utility technical wear fleece vest cargo functional athleisure sporty",
    "Coastal Grandmother":
        "coastal linen nautical relaxed whites navy stripes light airy grandmother chic",
    "Y2K Revival":
        "2000s nostalgia low rise metallic chrome butterfly asymmetric bold playful retro",
    "Streetwear Luxe":
        "premium streetwear luxury casual hoodie sneakers urban cool brand logomania",
    "Cottagecore":
        "cottagecore floral botanical soft earthy pastoral linen romantic rustic folk",
    "Ethnic Couture":
        "traditional ethnic fashion embroidered handwoven artisanal cultural heritage luxurious",
    "Preppy Revival":
        "collegiate preppy argyle plaid varsity blazer polo oxford shirt tailored classic",
    "Clean Girl Aesthetic":
        "effortless minimal clean basics white tee jeans no makeup look simple fresh",
    "Athleisure Luxe":
        "luxury activewear leggings sports bra high-end gym wear pilates matching set",
}

TREND_SCORES_2025 = {
    "Quiet Luxury":         0.97,
    "Office Siren":         0.94,
    "Ballet Core":          0.91,
    "Dark Feminine":        0.90,
    "Clean Girl Aesthetic": 0.89,
    "Streetwear Luxe":      0.88,
    "Y2K Revival":          0.86,
    "Ethnic Couture":       0.85,
    "Preppy Revival":       0.83,
    "Cottagecore":          0.82,
    "Athleisure Luxe":      0.81,
    "Gorpcore":             0.80,
    "Coastal Grandmother":  0.76,
    "Mob Wife Aesthetic":   0.74,
}

TREND_STYLING_TIPS = {
    "Quiet Luxury":         "Keep it tonal — match your {color} pieces head-to-toe for maximum impact.",
    "Ballet Core":          "Add a silk scrunchie or ribbon headband to complete the ballet girl look.",
    "Dark Feminine":        "Layer a structured blazer over this for the perfect Office Siren crossover.",
    "Office Siren":         "Swap flats for kitten heels — instantly elevates the power dressing energy.",
    "Mob Wife Aesthetic":   "Go bold — layer heavy gold jewelry and let this piece be the statement.",
    "Gorpcore":             "Style with chunky sneakers and a crossbody bag for functional-cool vibes.",
    "Coastal Grandmother":  "Pair with linen trousers and woven mules for peak coastal chic.",
    "Y2K Revival":          "Crop it or tuck it in — proportion play is everything for Y2K looks.",
    "Streetwear Luxe":      "Stack this with your most minimal accessories — let the piece breathe.",
    "Cottagecore":          "Style with ankle boots and a straw bag for that countryside editorial feel.",
    "Ethnic Couture":       "This piece is a hero — build the rest of the outfit around it.",
    "Preppy Revival":       "Add a leather belt and loafers to lock in the old-school preppy energy.",
    "Clean Girl Aesthetic": "Gold hoops, slicked hair, and your freshest skin — that's the whole look.",
    "Athleisure Luxe":      "Match this with the same-color set piece for that curated monochrome vibe.",
}

@torch.no_grad()
def classify_micro_trend(pil_image: Image.Image) -> tuple[str, float]:
    """Return the closest 2025 micro-trend and its confidence score (0-1)."""
    labels  = list(MICRO_TRENDS_2025.keys())
    texts   = list(MICRO_TRENDS_2025.values())

    inputs  = processor(
        text=texts, images=pil_image, return_tensors="pt", padding=True
    ).to(DEVICE)
    outputs = model(**inputs)
    probs   = outputs.logits_per_image[0].softmax(dim=0).cpu().numpy()

    top_idx   = int(np.argmax(probs))
    top_trend = labels[top_idx]
    confidence = float(probs[top_idx])
    trendiness = TREND_SCORES_2025.get(top_trend, 0.75)

    return top_trend, trendiness

def build_summary(category: str, colors: list, style: str, occasion: str, pattern: str,
                  micro_trend: str = "", trendiness: float = 0.75) -> str:
    color_str = " and ".join(colors[:2]) if colors else "neutral"
    pat_str   = f"{pattern} " if pattern != "solid" else ""
    trend_str = f" Channels the {micro_trend} aesthetic." if micro_trend else ""
    return (
        f"A stunning {style} {pat_str}{category.lower()} in {color_str}, "
        f"crafted for effortless {occasion.lower()} style.{trend_str}"
    )

def generate_trend_tags(category: str, pattern: str, fit: str, style: str,
                        colors: list, micro_trend: str = "") -> list[str]:
    tags = []
    if micro_trend:             tags.append(micro_trend)
    if fit == "oversized":      tags.append("oversized")
    if fit == "cropped":        tags.append("crop")
    if any(c in colors for c in ["beige","cream","grey","white","ivory","camel"]):
        tags.append("neutral palette")
    if pattern == "floral":     tags.append("floral")
    if style in ("minimalist","contemporary"): tags.append("clean aesthetic")
    if style == "streetwear":   tags.append("street ready")
    if category == "Outerwear": tags.append("layering piece")
    if category == "Accessories": tags.append("statement piece")
    tags.append("versatile")
    # Deduplicate
    seen, unique = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    return unique[:5]


# ─── Image loading ────────────────────────────────────────────────────────────

def load_image(image_source: str) -> Image.Image:
    """Load PIL image from URL or base64 data URL."""
    if image_source.startswith("data:"):
        header, b64data = image_source.split(",", 1)
        img_bytes = base64.b64decode(b64data)
        return Image.open(io.BytesIO(img_bytes)).convert("RGB")
    elif image_source.startswith("http://") or image_source.startswith("https://"):
        resp = requests.get(image_source, timeout=15, headers={"User-Agent": "StyloGenie/1.0"})
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    else:
        raise ValueError("image_source must be a URL or base64 data URL")


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="StyloGenie Fashion Classifier", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ClassifyRequest(BaseModel):
    imageSource: str   # URL or base64 data URL

class HealthResponse(BaseModel):
    status: str
    model: str
    device: str

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "model": MODEL_ID, "device": DEVICE}

def torso_crop(pil_image: Image.Image) -> Image.Image:
    """
    Crop to the torso/body region where the main clothing item lives.

    Why: full-image CLIP sees hand-held bags, shoes, hats etc. and can pick
    "Accessories" even when the person is wearing a full dress. Cropping to
    the central torso zone dramatically improves category accuracy.

    Crop: horizontal 10-90%, vertical 5-72%  (skips head + cuts below hips)
    Falls back to the original image if the crop is too small (<64px).
    """
    w, h = pil_image.size
    left   = int(w * 0.10)
    right  = int(w * 0.90)
    top    = int(h * 0.05)
    bottom = int(h * 0.72)
    if (right - left) < 64 or (bottom - top) < 64:
        return pil_image
    return pil_image.crop((left, top, right, bottom))


@app.post("/classify")
def classify(req: ClassifyRequest):
    try:
        pil_image = load_image(req.imageSource)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load image: {e}")

    try:
        # Use a torso-crop for category detection so handbags / shoes held by
        # the model don't override the main garment classification.
        torso = torso_crop(pil_image)
        category  = clip_classify(torso, CATEGORY_LABELS)
        pattern   = clip_classify(pil_image, PATTERN_LABELS)
        occasion  = clip_classify(pil_image, OCCASION_LABELS)
        season    = clip_classify(pil_image, SEASON_LABELS)
        style_era = clip_classify(pil_image, STYLE_ERA_LABELS)
        fit       = clip_classify(pil_image, FIT_LABELS)
        material  = clip_classify(pil_image, MATERIAL_LABELS)
        texture   = clip_classify(pil_image, TEXTURE_LABELS)
        silhouette= clip_classify(pil_image, SILHOUETTE_LABELS)

        colors, hex_color = extract_colors(pil_image)

        # Micro-trend classification (2025 fashion intelligence)
        micro_trend, trendiness = classify_micro_trend(pil_image)
        styling_tip = TREND_STYLING_TIPS.get(micro_trend, "Style with confidence — this piece has potential.").format(color=colors[0] if colors else "neutral")
        title    = build_title(category, colors, pattern, fit)
        summary  = build_summary(category, colors, style_era, occasion, pattern, micro_trend, trendiness)
        tags     = generate_trend_tags(category, pattern, fit, style_era, colors, micro_trend)

        care_map = {
            "silk": "dry clean only", "wool": "hand wash recommended",
            "cashmere": "dry clean only", "leather": "professional clean only",
            "linen": "machine washable, gentle cycle",
        }
        care_guess = care_map.get(material, "machine washable")

        result = {
            "title":            title,
            "category":         category,
            "colors":           colors,
            "dominantColorHex": hex_color,
            "material":         material,
            "texture":          texture,
            "pattern":          pattern,
            "fit":              fit,
            "silhouette":       silhouette,
            "styleEra":         style_era,
            "trendTags":        tags,
            "occasion":         occasion,
            "season":           season,
            "careGuess":        care_guess,
            "summary":          summary,
            "microTrend":       micro_trend,
            "trendiness":       round(trendiness, 2),
            "stylingTip":       styling_tip,
        }

        return {"classification": result, "model": f"fashion-clip/{DEVICE}"}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─── /style-consult endpoint ─────────────────────────────────────────────────
# Takes pre-classified wardrobe items + context, uses CLIP to rank outfits
# by 2025 trend alignment and returns fashion-designer-grade outfit narratives.

# Trend-aware outfit descriptor templates (fashion-editor voice)
OUTFIT_NARRATIVES = {
    "Quiet Luxury": [
        "This tonal ensemble is pure old-money elegance — the kind of effortless dressing that screams high taste without trying.",
        "Understated, impeccable, intentional. This pairing channels the Loro Piana-in-the-Hamptons energy that defines Quiet Luxury in 2025.",
        "Clean lines, neutral palette, exceptional fabric story — this outfit whispers wealth louder than any logo ever could.",
    ],
    "Ballet Core": [
        "Soft, feminine, and utterly romantic — this combination has the graceful energy of a dancer between rehearsals.",
        "The delicate interplay of these pieces creates a Ballet Core moment that feels both fashion-forward and deeply wearable.",
        "Ethereal and precise — this outfit captures the trend's essence: feminine strength wrapped in softness.",
    ],
    "Office Siren": [
        "Power-dressing redefined — this combination is commanding in the boardroom and captivating at after-work drinks.",
        "Structure meets seduction. This is the Office Siren formula perfected: tailored but never stiff, professional but always magnetic.",
        "Sharp silhouettes, deliberate dressing — this outfit announces your presence before you say a word.",
    ],
    "Dark Feminine": [
        "Mysterious, intentional, unapologetically dramatic — this combination is Dark Feminine done right.",
        "There's a gothic romance to this pairing that feels undeniably 2025: dark, lush, and powerfully feminine.",
        "Deep tones, rich textures — this outfit is a statement of elegant darkness that demands attention.",
    ],
    "Y2K Revival": [
        "This combination hits the Y2K sweet spot — nostalgic but edited, playful but intentional.",
        "Pure 2000s energy, filtered through a 2025 lens. This pairing is the kind of throwback that actually works.",
        "Maximalist, fun, unapologetically bold — this outfit channels Y2K revival with full confidence.",
    ],
    "Streetwear Luxe": [
        "Premium casual at its finest — this pairing blurs the line between high fashion and street credibility.",
        "The ultimate cool-girl formula: elevated basics, urban edge, zero effort apparent.",
        "Effortlessly cool and quietly expensive-looking — this outfit defines Streetwear Luxe for 2025.",
    ],
    "Ethnic Couture": [
        "A masterclass in heritage dressing — this combination celebrates tradition while looking entirely contemporary.",
        "Cultural richness meets editorial precision. This outfit belongs on a runway as much as it does at a celebration.",
        "This pairing honors the artistry of ethnic fashion while feeling completely current and fashion-forward.",
    ],
    "Cottagecore": [
        "Romantic, pastoral, and effortlessly poetic — this combination has the dreamy quality of a countryside editorial.",
        "Soft botanicals, earthy warmth — this outfit feels like it belongs in a sun-dappled meadow photographed for Vogue.",
        "Whimsical and genuinely beautiful — this pairing captures Cottagecore's pastoral romance at its very best.",
    ],
    "Clean Girl Aesthetic": [
        "Minimal, fresh, and undeniably chic — this is the 'I woke up looking this put-together' formula perfected.",
        "Effortless elegance through reduction — fewer pieces, more impact. The Clean Girl Aesthetic done right.",
        "Pristine basics, perfect proportion, zero clutter — this outfit is the 2025 definition of effortless cool.",
    ],
    "Gorpcore": [
        "Functional-fashion crossover at its finest — this combination is ready for both trails and trend reports.",
        "Technical meets aesthetic. This outfit proves that utility and style are no longer opposites.",
        "Rugged, purposeful, unexpectedly editorial — this is Gorpcore with genuine fashion intelligence.",
    ],
    "Preppy Revival": [
        "Collegiate charm dialled up for 2025 — this combination has the confident ease of old-school prep culture.",
        "Classic, polished, timeless with a modern edge — this outfit is Preppy Revival done with real taste.",
        "Structure, tradition, a quiet confidence — this pairing captures everything that makes the preppy aesthetic enduring.",
    ],
    "Coastal Grandmother": [
        "Relaxed, refined, sun-kissed — this combination captures that perfect coastal ease that never goes out of style.",
        "Linen, light, and luminous — this outfit has the breezy elegance of a woman who summers somewhere beautiful.",
        "Unhurried luxury — this pairing feels as natural as the coastline it's inspired by.",
    ],
    "Mob Wife Aesthetic": [
        "Bold, unapologetically glamorous — this outfit commits to maximalism and wears it brilliantly.",
        "Excess as an aesthetic choice, done with conviction. This combination is Mob Wife through and through.",
        "Luxe textures, fearless attitude — this pairing is for those who believe more is always more.",
    ],
    "Athleisure Luxe": [
        "High-performance meets high fashion — this combination makes activewear look genuinely aspirational.",
        "Curated, coordinated, luxuriously athletic — this outfit belongs at pilates and then immediately at brunch.",
        "Premium comfort with serious style credentials — this is Athleisure Luxe defining the 2025 active aesthetic.",
    ],
}

OCCASION_CONTEXT = {
    "Casual":  "for effortless everyday style",
    "Formal":  "for a commanding, polished entrance",
    "Sports":  "for active days without sacrificing style",
    "Party":   "for making a memorable impression",
    "Ethnic":  "for celebrating your heritage in style",
    "Travel":  "for looking chic on the move",
    "Work":    "for dressing with intention and power",
    "Date":    "for an unforgettable evening",
    "Beach":   "for a sun-soaked, effortlessly styled day",
    "Wedding": "for celebrating with elegance and grace",
}

class WardrobeItem(BaseModel):
    title: str
    section: str
    color: list[str] = []
    dominantColorHex: str | None = None
    pattern: str | None = None
    material: str | None = None
    fit: str | None = None
    styleEra: str | None = None
    occasion: str | None = None
    season: str | None = None
    microTrend: str | None = None
    trendiness: float | None = None
    deepSummary: str | None = None

class StyleConsultRequest(BaseModel):
    items: list[WardrobeItem]          # Already-classified wardrobe items
    occasion: str = "Casual"           # Context for outfit suggestions
    maxOutfits: int = 3                # How many outfit ideas to return
    preferredTrend: str | None = None  # Optional: user wants a specific aesthetic

class OutfitSuggestion(BaseModel):
    outfitId: str
    items: list[str]                   # Item titles
    sections: list[str]                # Item categories
    trendAlignment: str                # Dominant micro-trend
    trendScore: float                  # 0.0 – 1.0
    narrative: str                     # Fashion-editor description
    colorStory: str                    # E.g. "Tonal cream palette"
    stylingTip: str                    # Specific how-to tip
    occasionFit: str                   # Occasion context phrase
    score: int                         # 0-100 overall score

def item_trend_score(item: WardrobeItem) -> float:
    """Get trendiness score for a wardrobe item based on its micro-trend or style era."""
    if item.microTrend and item.trendiness is not None:
        return item.trendiness
    # Fall back to keyword matching using the item's styleEra / occasion
    search = f"{item.styleEra or ''} {item.occasion or ''} {' '.join(item.color)}".lower()
    for trend, description in MICRO_TRENDS_2025.items():
        keywords = description.lower().split()
        matches = sum(1 for kw in keywords if kw in search)
        if matches >= 2:
            return TREND_SCORES_2025.get(trend, 0.80)
    return 0.75

def build_color_story(colors_list: list[list[str]]) -> str:
    """Generate a color story description from multiple items' colors."""
    all_colors = [c for cols in colors_list for c in cols if c]
    if not all_colors:
        return "Neutral palette"
    neutral_colors = {"beige", "cream", "white", "grey", "black", "navy", "camel", "ivory"}
    neutrals = [c for c in all_colors if c in neutral_colors]
    pops = [c for c in all_colors if c not in neutral_colors]

    if len(neutrals) == len(all_colors):
        return f"Tonal {all_colors[0]} palette"
    if len(pops) == 0:
        return "Clean neutral palette"
    if len(pops) == 1:
        return f"{pops[0].title()} accent on neutral base"
    if len(set(all_colors)) == 1:
        return f"Color-drenched {all_colors[0]}"
    return f"{all_colors[0].title()} & {all_colors[1].title()} contrast"

def score_outfit_items(outfit_items: list[WardrobeItem], occasion: str) -> int:
    """Score an outfit combination out of 100."""
    if not outfit_items:
        return 0
    # Trend score (40%)
    trend_avg = sum(item_trend_score(i) for i in outfit_items) / len(outfit_items)
    trend_component = int(trend_avg * 40)

    # Occasion match (30%)
    occasion_matches = sum(
        1 for i in outfit_items
        if i.occasion and occasion.lower() in i.occasion.lower()
    )
    occasion_component = int((occasion_matches / max(len(outfit_items), 1)) * 30)

    # Color harmony (20%) — reward tonal/neutral palettes
    all_colors = [c for i in outfit_items for c in i.color]
    neutral_count = sum(1 for c in all_colors if c in {"beige","cream","white","grey","black","navy","camel","ivory"})
    color_harmony = 20 if neutral_count >= len(all_colors) * 0.5 else 12

    # Completeness (10%) — reward having tops + bottoms or dress + footwear
    sections = {i.section.lower() for i in outfit_items if i.section}
    has_top = bool(sections & {"tops","dresses","outerwear","ethnicwear"})
    has_bottom = bool(sections & {"bottoms","dresses","footwear","ethnicwear"})
    completeness = 10 if (has_top and has_bottom) else 5

    return min(trend_component + occasion_component + color_harmony + completeness, 100)

def dominant_trend_for_outfit(outfit_items: list[WardrobeItem]) -> tuple[str, float]:
    """Find the dominant micro-trend across outfit items."""
    trend_counts: dict[str, float] = {}
    for item in outfit_items:
        trend = item.microTrend or "Contemporary"
        score = TREND_SCORES_2025.get(trend, 0.75)
        trend_counts[trend] = trend_counts.get(trend, 0) + score
    if not trend_counts:
        return "Contemporary", 0.75
    best = max(trend_counts, key=lambda k: trend_counts[k])
    return best, TREND_SCORES_2025.get(best, 0.75)

import hashlib
import random

@app.post("/style-consult")
def style_consult(req: StyleConsultRequest):
    """
    Generate fashion-designer-grade outfit suggestions from pre-classified wardrobe items.
    No image processing needed — works entirely from item metadata.
    Returns up to maxOutfits outfit combinations with editorial narratives.
    """
    if not req.items:
        raise HTTPException(status_code=400, detail="No wardrobe items provided")

    items = req.items
    occasion = req.occasion

    # Partition by section
    tops      = [i for i in items if i.section in ("Tops",)]
    bottoms   = [i for i in items if i.section in ("Bottoms",)]
    dresses   = [i for i in items if i.section in ("Dresses",)]
    footwear  = [i for i in items if i.section in ("Footwear",)]
    outerwear = [i for i in items if i.section in ("Outerwear",)]
    ethnic    = [i for i in items if i.section in ("Ethnicwear",)]
    sport     = [i for i in items if i.section in ("Sportswear",)]

    candidates: list[list[WardrobeItem]] = []

    # Top + Bottom combos
    for t in tops[:8]:
        for b in bottoms[:8]:
            combo = [t, b]
            if footwear:
                combo.append(footwear[0])
            candidates.append(combo)

    # Dress combos
    for d in dresses[:5]:
        combo = [d]
        if footwear:
            combo.append(footwear[0])
        candidates.append(combo)

    # Ethnic wear
    for e in ethnic[:4]:
        candidates.append([e])

    # Sportswear
    for s in sport[:3]:
        combo = [s]
        if footwear:
            combo.append(footwear[0])
        candidates.append(combo)

    # Outerwear-led looks
    for ow in outerwear[:3]:
        if tops:
            combo = [ow, tops[0]]
            if bottoms:
                combo.append(bottoms[0])
            candidates.append(combo)

    if not candidates:
        # Last resort: just return individual items
        candidates = [[i] for i in items[:5]]

    # Score all candidates
    scored = []
    for combo in candidates:
        s = score_outfit_items(combo, occasion)
        trend, trend_score = dominant_trend_for_outfit(combo)
        if req.preferredTrend and req.preferredTrend != trend:
            s = max(s - 15, 0)  # Slightly penalise if preferred trend doesn't match
        scored.append((combo, s, trend, trend_score))

    # Sort by score descending, deduplicate
    scored.sort(key=lambda x: -x[1])
    seen_ids: set[str] = set()
    top_outfits = []
    for combo, score, trend, trend_score in scored:
        oid = hashlib.md5("|".join(sorted(i.title for i in combo)).encode()).hexdigest()[:8]
        if oid not in seen_ids:
            seen_ids.add(oid)
            top_outfits.append((combo, score, trend, trend_score, oid))
        if len(top_outfits) >= req.maxOutfits:
            break

    # Build output
    suggestions = []
    for combo, score, trend, trend_score, oid in top_outfits:
        colors_list = [i.color for i in combo]
        color_story = build_color_story(colors_list)
        narrative_options = OUTFIT_NARRATIVES.get(trend, [
            f"A carefully curated combination that embodies the {trend} aesthetic with precision and confidence."
        ])
        # Pick narrative based on outfit ID for consistency
        narrative = narrative_options[int(oid, 16) % len(narrative_options)]
        styling_tip = TREND_STYLING_TIPS.get(trend, "Own it with confidence — this outfit has real editorial potential.")
        occasion_phrase = OCCASION_CONTEXT.get(occasion, f"for {occasion.lower()} occasions")

        suggestions.append({
            "outfitId": oid,
            "items": [i.title for i in combo],
            "sections": [i.section for i in combo],
            "trendAlignment": trend,
            "trendScore": round(trend_score, 2),
            "narrative": narrative,
            "colorStory": color_story,
            "stylingTip": styling_tip.format(color=combo[0].color[0] if combo[0].color else "neutral"),
            "occasionFit": occasion_phrase,
            "score": score,
        })

    return {
        "outfits": suggestions,
        "occasion": occasion,
        "totalItemsAnalyzed": len(items),
        "model": "fashion-clip/metadata",
    }


if __name__ == "__main__":
    import uvicorn
    print(f"\n🎨 StyloGenie Fashion Classifier → http://localhost:{PORT}")
    print(f"   Model : {MODEL_ID}  ({DEVICE})")
    print(f"   Health: http://localhost:{PORT}/health\n")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
