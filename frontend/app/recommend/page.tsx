"use client";
// frontend/app/recommend/page.tsx
// AI Outfit Recommendation — shows scored outfit combinations from the user's wardrobe.

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type WardrobeItem = {
  id: string;
  imageUrl: string;
  title: string | null;
  section: string | null;
  color: string[];
  dominantColorHex: string | null;
  occasion: string | null;
  season: string | null;
  styleEra: string | null;
};

type OutfitSuggestion = {
  id: string;
  items: WardrobeItem[];
  score: number;
  colorStory: string;          // "Monochrome" | "Complementary" | "Analogous" | "Triadic" | "Neutral Palette" | "Neutral Base" | "Mixed"
  reasons: string[];
  occasion: string | null;
  season: string | null;
  dominantTrend: string;       // 2025 micro-trend label
  trendiness: number;          // 0.0 – 1.0
  narrative: string;           // Fashion-editor description
  outfitType: string;          // "Western" | "Ethnic" | "Sport" | "Fusion"
};

type Stats = {
  total: number;
  approved: number;
  bySection: Record<string, number>;
  byOccasion: Record<string, number>;
  bySeason: Record<string, number>;
  gaps: string[];
  readyForRecommendations: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const OCCASION_OPTIONS = ["All", "Casual", "Formal", "Sports", "Party", "Ethnic"];
const SEASON_OPTIONS   = ["All", "Spring", "Summer", "Autumn", "Winter"];

const SECTION_EMOJI: Record<string, string> = {
  Tops: "👕", Bottoms: "👖", Dresses: "👗", Outerwear: "🧥",
  Footwear: "👟", Accessories: "👜", Ethnicwear: "🥻", Sportswear: "🏃",
};

const OUTFIT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  Western: { label: "Western",    color: "bg-blue-900/30 text-blue-300 border-blue-700/30",    icon: "👖" },
  Ethnic:  { label: "Ethnic",     color: "bg-amber-900/30 text-amber-300 border-amber-700/30", icon: "🥻" },
  Fusion:  { label: "Fusion",     color: "bg-teal-900/30 text-teal-300 border-teal-700/30",    icon: "✨" },
  Sport:   { label: "Sportswear", color: "bg-green-900/30 text-green-300 border-green-700/30", icon: "🏃" },
};

const COLOR_STORY_LABELS: Record<string, string> = {
  Monochrome:       "Tonal",
  Complementary:    "Complementary",
  Analogous:        "Analogous",
  Triadic:          "Triadic",
  "Neutral Palette":"Neutral",
  "Neutral Base":   "Neutral",
  Mixed:            "Mixed",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-emerald-400 border-emerald-500/30 bg-emerald-900/20" :
    score >= 60 ? "text-yellow-400 border-yellow-500/30 bg-yellow-900/20" :
                  "text-rose-400 border-rose-500/30 bg-rose-900/20";
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      {score}%
    </span>
  );
}

function TrendinessBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "bg-amber-400" : pct >= 75 ? "bg-purple-500" : "bg-slate-500";
  return (
    <div className="flex items-center gap-1.5" title={`${pct}% trend score`}>
      <div className="w-12 h-1 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-white/30">{pct}%</span>
    </div>
  );
}

function ColorDot({ hex }: { hex: string | null }) {
  if (!hex) return null;
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border border-white/20 flex-shrink-0"
      style={{ backgroundColor: hex }}
      title={hex}
    />
  );
}

// Smart grid columns based on item count
function getGridClass(count: number): string {
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  if (count === 4) return "grid-cols-2"; // 2×2 square
  return "grid-cols-3";                  // 5,6 → 3-col
}

function OutfitCard({
  outfit,
  onLike,
  onDislike,
  liked,
  onSaveToCalendar,
  onShare,
}: {
  outfit: OutfitSuggestion;
  onLike: () => void;
  onDislike: () => void;
  liked: "like" | "dislike" | null;
  onSaveToCalendar: () => void;
  onShare: () => void;
}) {
  const gridCols = getGridClass(outfit.items.length);
  const typeConfig = OUTFIT_TYPE_CONFIG[outfit.outfitType] ?? OUTFIT_TYPE_CONFIG.Western;
  const colorLabel = COLOR_STORY_LABELS[outfit.colorStory] ?? outfit.colorStory;

  return (
    <div className={`bg-[#13131f] border rounded-2xl overflow-hidden transition-all duration-200 group ${
      liked === "like"    ? "border-emerald-500/60 shadow-emerald-900/20 shadow-xl" :
      liked === "dislike" ? "border-rose-500/30 opacity-50" :
                            "border-white/8 hover:border-purple-600/40 hover:shadow-xl hover:shadow-purple-900/10"
    }`}>

      {/* Outfit image grid */}
      <div className={`grid ${gridCols} gap-px bg-black/40`}>
        {outfit.items.map((item) => (
          <div key={item.id} className="relative overflow-hidden group/item" style={{ aspectRatio: "3/4" }}>
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title ?? item.section ?? "item"}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-800/50 text-2xl opacity-40">
                {SECTION_EMOJI[item.section ?? ""] ?? "👗"}
              </div>
            )}
            {/* Item label on hover */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent
                            opacity-0 group-hover/item:opacity-100 transition-opacity duration-200 flex items-end">
              <p className="text-[9px] text-white/90 px-2 pb-1.5 truncate w-full font-medium">
                {item.title ?? item.section}
              </p>
            </div>
            {/* Color dot overlay */}
            {item.dominantColorHex && (
              <div
                className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-white/30"
                style={{ backgroundColor: item.dominantColorHex }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Card body */}
      <div className="p-3.5 space-y-2.5">

        {/* Top row: score + outfit type + color dots */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <ScoreBadge score={outfit.score} />
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-semibold ${typeConfig.color}`}>
              {typeConfig.icon} {typeConfig.label}
            </span>
          </div>
          <div className="flex gap-0.5 flex-shrink-0">
            {outfit.items.slice(0, 5).map((item) => (
              <ColorDot key={item.id} hex={item.dominantColorHex} />
            ))}
          </div>
        </div>

        {/* Trend badge + trendiness bar */}
        <div className="flex items-center justify-between gap-2">
          {outfit.dominantTrend && (
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 border border-purple-600/30 font-medium truncate">
              ✦ {outfit.dominantTrend}
              {outfit.trendiness >= 0.88 && " 🔥"}
            </span>
          )}
          <TrendinessBar value={outfit.trendiness} />
        </div>

        {/* Color story */}
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-white/25 uppercase tracking-wider">Color:</span>
          <span className="text-[9px] text-white/50 font-medium">{colorLabel}</span>
        </div>

        {/* Fashion-editor narrative */}
        {outfit.narrative && (
          <p className="text-[10px] text-white/55 italic leading-relaxed border-l-2 border-purple-500/40 pl-2.5 line-clamp-2">
            &ldquo;{outfit.narrative}&rdquo;
          </p>
        )}

        {/* Tags — occasion + season */}
        <div className="flex flex-wrap gap-1">
          {outfit.occasion && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-300 border border-purple-700/25">
              {outfit.occasion}
            </span>
          )}
          {outfit.season && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-900/30 text-blue-300 border border-blue-700/25">
              {outfit.season}
            </span>
          )}
        </div>

        {/* Scoring reasons */}
        {outfit.reasons.length > 0 && (
          <ul className="space-y-0.5">
            {outfit.reasons.slice(0, 3).map((r, i) => (
              <li key={i} className="text-[10px] text-white/40 flex items-start gap-1.5">
                <span className="text-white/15 mt-0.5 flex-shrink-0">•</span>
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Item names */}
        <div className="border-t border-white/5 pt-2 flex flex-wrap gap-1">
          {outfit.items.map((item) => (
            <span key={item.id} className="text-[9px] text-white/25 truncate max-w-[90px] bg-white/4 rounded px-1.5 py-0.5">
              {item.title ?? item.section}
            </span>
          ))}
        </div>

        {/* Like / Dislike / Calendar */}
        <div className="flex gap-1.5 pt-0.5">
          <button
            onClick={onLike}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-all ${
              liked === "like"
                ? "bg-emerald-600 border-emerald-500 text-white"
                : "border-white/10 text-white/35 hover:border-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-900/10"
            }`}
          >
            👍
          </button>
          <button
            onClick={onDislike}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-all ${
              liked === "dislike"
                ? "bg-rose-600/40 border-rose-500 text-white"
                : "border-white/10 text-white/35 hover:border-rose-500/60 hover:text-rose-400 hover:bg-rose-900/10"
            }`}
          >
            👎
          </button>
          <button
            onClick={onSaveToCalendar}
            title="Save to Outfit Calendar"
            className="flex-1 text-xs py-1.5 rounded-lg border border-white/10 text-white/35 hover:border-teal-500/60 hover:text-teal-400 hover:bg-teal-900/10 transition-all"
          >
            📅
          </button>
          <button
            onClick={onShare}
            title="Download outfit as PNG"
            className="flex-1 text-xs py-1.5 rounded-lg border border-white/10 text-white/35 hover:border-violet-500/60 hover:text-violet-400 hover:bg-violet-900/10 transition-all"
          >
            📤
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Canvas PNG Export ────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

async function loadImageFromUrl(url: string): Promise<HTMLImageElement | null> {
  try {
    // Fetch with credentials (cookies) so auth-protected images load
    const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
    const resp = await fetch(fullUrl, { credentials: "include" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(null); };
      img.src = objectUrl;
    });
  } catch {
    return null;
  }
}

async function exportOutfitAsPNG(outfit: OutfitSuggestion): Promise<void> {
  const CARD_W = 600;
  const IMG_H  = 400;
  const INFO_H = 220;
  const TOTAL_H = IMG_H + INFO_H;
  const COLS = Math.min(outfit.items.length, 3);
  const ROWS = Math.ceil(outfit.items.length / COLS);
  const cellW = Math.floor(CARD_W / COLS);
  const cellH = Math.floor(IMG_H  / ROWS);

  const canvas  = document.createElement("canvas");
  canvas.width  = CARD_W;
  canvas.height = TOTAL_H;
  const ctx = canvas.getContext("2d")!;

  // ── Background ──
  ctx.fillStyle = "#13131f";
  ctx.fillRect(0, 0, CARD_W, TOTAL_H);

  // ── Images ──
  const images = await Promise.all(outfit.items.map((i) => loadImageFromUrl(i.imageUrl)));
  images.forEach((img, idx) => {
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    const x = col * cellW;
    const y = row * cellH;
    if (img) {
      // cover-fit
      const scale = Math.max(cellW / img.width, cellH / img.height);
      const sw = cellW / scale;
      const sh = cellH / scale;
      const sx = (img.width  - sw) / 2;
      const sy = (img.height - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
    } else {
      ctx.fillStyle = "#1e1a2e";
      ctx.fillRect(x, y, cellW - 1, cellH - 1);
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.font = "36px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("👗", x + cellW / 2, y + cellH / 2 + 12);
    }
    // Thin separator
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cellW, cellH);
  });

  // ── Gradient overlay on image bottom ──
  const grad = ctx.createLinearGradient(0, IMG_H - 80, 0, IMG_H);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(1, "rgba(19,19,31,0.95)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, IMG_H - 80, CARD_W, 80);

  // ── Info panel ──
  const iy = IMG_H + 20;

  // Score badge
  const scoreColor = outfit.score >= 80 ? "#34d399" : outfit.score >= 60 ? "#fbbf24" : "#f87171";
  ctx.fillStyle = scoreColor;
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${outfit.score}%`, 20, iy + 24);

  // Outfit type
  ctx.fillStyle = "rgba(167,139,250,0.9)";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(`${outfit.outfitType} Look`, 70, iy + 22);

  // Trend badge
  if (outfit.dominantTrend) {
    ctx.fillStyle = "rgba(167,139,250,0.6)";
    ctx.font = "12px sans-serif";
    ctx.fillText(`✦ ${outfit.dominantTrend}`, 20, iy + 50);
  }

  // Narrative
  if (outfit.narrative) {
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "italic 11px sans-serif";
    const maxWidth = CARD_W - 40;
    const words = outfit.narrative.split(" ");
    let line = "";
    let lineY = iy + 78;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth) {
        ctx.fillText(`"${line}"`, 20, lineY);
        line = word;
        lineY += 16;
        if (lineY > iy + 120) break;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line.startsWith('"') ? line : `"${line}"`, 20, lineY);
  }

  // Tags
  const tags = [outfit.occasion, outfit.season].filter(Boolean);
  let tx = 20;
  const tagY = iy + 150;
  ctx.font = "11px sans-serif";
  tags.forEach((tag) => {
    const w = ctx.measureText(tag!).width + 16;
    ctx.fillStyle = "rgba(139,92,246,0.25)";
    roundRect(ctx, tx, tagY - 14, w, 20, 4);
    ctx.fill();
    ctx.fillStyle = "rgba(167,139,250,0.85)";
    ctx.fillText(tag!, tx + 8, tagY);
    tx += w + 6;
  });

  // Watermark
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("StyloGenie ✦ AI Fashion", CARD_W - 16, TOTAL_H - 12);

  // ── Download ──
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `outfit-${outfit.id}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, "image/png");
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Simple browser-side outfit hash (not SHA-256, but deterministic and collision-resistant)
function simpleHash(itemIds: string[]): string {
  const str = [...itemIds].sort().join(",");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── Save to Calendar Mini-Modal ─────────────────────────────────────────────
function SaveToCalendarModal({
  outfit, onClose, onSaved,
}: { outfit: OutfitSuggestion; onClose: () => void; onSaved: () => void }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [label, setLabel] = useState(`${outfit.outfitType} Look · ${outfit.dominantTrend || outfit.occasion || "Outfit"}`);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.post("/api/v1/calendar", {
        date,
        outfitLabel: label,
        itemIds: outfit.items.map((i) => i.id),
        outfitType: outfit.outfitType,
        occasion: outfit.occasion,
      });
      onSaved();
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(12px)" }}>
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold text-sm">Save to Calendar</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-xl">×</button>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {outfit.items.slice(0, 4).map((item) => (
            <img key={item.id} src={item.imageUrl} alt="" className="w-12 h-14 rounded-lg object-cover border border-white/10" />
          ))}
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={todayStr}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500/60" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Outfit label"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/60" />
        <button onClick={save} disabled={saving}
          className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all disabled:opacity-50">
          {saving ? "Saving…" : "Save to Calendar ✦"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecommendPage() {
  const [outfits, setOutfits]     = useState<OutfitSuggestion[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(false);
  const [occasion, setOccasion]   = useState("All");
  const [season, setSeason]       = useState("All");
  // feedback: outfitId → "like" | "dislike" | null (local display state)
  const [feedback, setFeedback]   = useState<Record<string, "like" | "dislike" | null>>({});
  // persistedMap: outfitHash → reaction (loaded from backend)
  const [persistedMap, setPersistedMap] = useState<Record<string, string>>({});
  const [error, setError]         = useState<string | null>(null);
  const [calendarOutfit, setCalendarOutfit] = useState<OutfitSuggestion | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/recommend/stats");
      if (res.data) setStats(res.data);
    } catch (e) {
      console.warn("[recommend/stats]", e);
    }
  }, []);

  // Load persisted feedback map on mount
  useEffect(() => {
    api.get("/api/v1/feedback")
      .then((r) => setPersistedMap(r.data?.map ?? {}))
      .catch(() => {}); // non-critical
  }, []);

  const fetchOutfits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = { limit: "20" };
      if (occasion !== "All") params.occasion = occasion;
      if (season   !== "All") params.season   = season;

      const res = await api.get("/api/v1/recommend", { params });
      const fetched: OutfitSuggestion[] = res.data?.outfits ?? [];
      setOutfits(fetched);
      // Restore local feedback state from persisted map
      const restored: Record<string, "like" | "dislike" | null> = {};
      fetched.forEach((o) => {
        const hash = simpleHash(o.items.map((i) => i.id));
        const persisted = persistedMap[hash];
        if (persisted === "like" || persisted === "dislike") restored[o.id] = persisted;
        else restored[o.id] = null;
      });
      setFeedback(restored);
    } catch (e: any) {
      setError(e.response?.data?.error ?? e.message ?? "Failed to fetch recommendations");
    } finally {
      setLoading(false);
    }
  }, [occasion, season, persistedMap]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchOutfits(); }, [fetchOutfits]);

  async function handleFeedback(outfit: OutfitSuggestion, reaction: "like" | "dislike") {
    const current = feedback[outfit.id];
    const newReaction = current === reaction ? null : reaction;
    setFeedback((p) => ({ ...p, [outfit.id]: newReaction }));
    // Persist to backend
    try {
      if (newReaction) {
        await api.post("/api/v1/feedback", {
          itemIds: outfit.items.map((i) => i.id),
          reaction: newReaction,
          outfitType: outfit.outfitType,
          occasion: outfit.occasion,
        });
      } else {
        const hash = simpleHash(outfit.items.map((i) => i.id));
        await api.delete(`/api/v1/feedback/${hash}`);
      }
    } catch { /* non-critical */ }
  }

  const visibleOutfits = outfits.filter((o) => feedback[o.id] !== "dislike");
  const likedCount     = Object.values(feedback).filter((v) => v === "like").length;

  return (
    <>
    <div className="min-h-screen text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">✨</span> Outfit Studio
            </h1>
            <p className="text-sm text-white/40 mt-0.5">
              AI-curated outfit combinations · scored by color, trend & occasion
            </p>
          </div>
          <div className="flex items-center gap-2">
            {likedCount > 0 && (
              <span className="text-xs text-emerald-400/70 bg-emerald-900/20 px-2.5 py-1 rounded-full border border-emerald-800/30">
                {likedCount} liked
              </span>
            )}
            <button
              onClick={fetchOutfits}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500
                         disabled:opacity-50 text-sm font-medium transition-colors shadow-lg shadow-purple-900/30"
            >
              {loading
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <span>✨</span>
              }
              {loading ? "Generating…" : "Shuffle"}
            </button>
          </div>
        </div>

        {/* Wardrobe stats bar */}
        {stats && (
          <div className="bg-[#13131f] border border-white/8 rounded-2xl p-4">
            <div className="flex flex-wrap gap-6 items-center">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-[10px] text-white/35">Total items</p>
              </div>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {Object.entries(stats.bySection).map(([sec, count]) => (
                  <span key={sec} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-white/55 border border-white/5">
                    {SECTION_EMOJI[sec] ?? "👗"} {sec} <strong className="text-white/80">{count}</strong>
                  </span>
                ))}
              </div>
              {stats.gaps.length > 0 && (
                <div className="text-[10px] text-amber-400/70 space-y-0.5">
                  {stats.gaps.map((g, i) => <p key={i}>💡 {g}</p>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-1.5 bg-[#13131f] border border-white/8 rounded-xl px-3 py-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider mr-1">Occasion</span>
            {OCCASION_OPTIONS.map((o) => (
              <button
                key={o}
                onClick={() => setOccasion(o)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  occasion === o
                    ? "bg-purple-600 text-white shadow-sm shadow-purple-900/40"
                    : "text-white/45 hover:text-white hover:bg-white/5"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-[#13131f] border border-white/8 rounded-xl px-3 py-1.5">
            <span className="text-[10px] text-white/30 uppercase tracking-wider mr-1">Season</span>
            {SEASON_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  season === s
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-900/40"
                    : "text-white/45 hover:text-white hover:bg-white/5"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 text-sm text-rose-300 flex items-center gap-3">
            <span>⚠️</span>
            <span>{error}</span>
            <button onClick={fetchOutfits} className="ml-auto text-xs underline hover:no-underline">Retry</button>
          </div>
        )}

        {/* Empty state — not enough items */}
        {!loading && stats && !stats.readyForRecommendations && !error && (
          <div className="text-center py-20 space-y-3">
            <p className="text-6xl">👗</p>
            <p className="text-white font-semibold text-lg">Your wardrobe needs more items</p>
            <p className="text-white/40 text-sm max-w-sm mx-auto">
              Add at least 2 items via the <strong className="text-white/60">Describer</strong> to start generating outfit combinations.
            </p>
          </div>
        )}

        {/* No outfits for current filter */}
        {!loading && stats?.readyForRecommendations && visibleOutfits.length === 0 && !error && (
          <div className="text-center py-20">
            <p className="text-5xl mb-3">🤔</p>
            <p className="text-white/60 font-medium">No outfits match your current filters.</p>
            <p className="text-white/30 text-sm mt-1">Try a different occasion or season — or tap Shuffle.</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-[#13131f] border border-white/5 rounded-2xl overflow-hidden animate-pulse">
                <div className="bg-white/5" style={{ aspectRatio: "3/4" }} />
                <div className="p-3.5 space-y-2">
                  <div className="h-3 bg-white/5 rounded w-2/3" />
                  <div className="h-2 bg-white/5 rounded w-1/2" />
                  <div className="h-2 bg-white/5 rounded w-3/4" />
                  <div className="h-8 bg-white/3 rounded mt-3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Outfit grid */}
        {!loading && visibleOutfits.length > 0 && (
          <>
            <p className="text-xs text-white/25">
              {visibleOutfits.length} outfit{visibleOutfits.length !== 1 ? "s" : ""}
              {occasion !== "All" ? ` · ${occasion}` : ""}
              {season !== "All" ? ` · ${season}` : ""}
              {likedCount > 0 ? ` · ${likedCount} liked` : ""}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleOutfits.map((outfit) => (
                <OutfitCard
                  key={outfit.id}
                  outfit={outfit}
                  liked={feedback[outfit.id] ?? null}
                  onLike={() => handleFeedback(outfit, "like")}
                  onDislike={() => handleFeedback(outfit, "dislike")}
                  onSaveToCalendar={() => setCalendarOutfit(outfit)}
                  onShare={async () => {
                    toast.promise(exportOutfitAsPNG(outfit), {
                      loading: "Generating PNG…",
                      success: "Outfit saved as PNG!",
                      error: "Failed to export PNG",
                    });
                  }}
                />
              ))}
            </div>
          </>
        )}

        {/* Scoring explanation */}
        <div className="bg-[#13131f] border border-white/5 rounded-2xl p-5 mt-6">
          <h3 className="text-xs font-semibold text-white/50 mb-3 uppercase tracking-wider">How outfits are scored</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-white/35">
            <div>
              <p className="text-white/55 font-medium mb-1">🎨 Color Harmony · 40%</p>
              <p>Complementary, analogous, monochrome, and neutral pairings</p>
            </div>
            <div>
              <p className="text-white/55 font-medium mb-1">🎯 Occasion Match · 25%</p>
              <p>All pieces suited for the same setting (casual, formal, etc.)</p>
            </div>
            <div>
              <p className="text-white/55 font-medium mb-1">🌤 Season Fit · 20%</p>
              <p>Fabric and weight appropriate for the same season</p>
            </div>
            <div>
              <p className="text-white/55 font-medium mb-1">✨ Style Cohesion · 15%</p>
              <p>Era, trend, and aesthetic consistency across all items</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Save to Calendar modal */}
    {calendarOutfit && (
      <SaveToCalendarModal
        outfit={calendarOutfit}
        onClose={() => setCalendarOutfit(null)}
        onSaved={() => toast.success("Outfit saved to calendar 📅")}
      />
    )}
    </>
  );
}
