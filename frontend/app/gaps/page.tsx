"use client";
// frontend/app/gaps/page.tsx
// Feature 4: Dedicated Wardrobe Gap Analysis page
// Analyses the user's wardrobe stats and shows AI-powered gap recommendations
// with shopping links and priority scores.

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type WardrobeStats = {
  total: number;
  totalValue: number;
  bySection: Record<string, number>;
  gapAnalysis: {
    section: string;
    idealPct: number;
    actualPct: number;
    gap: boolean;
  }[];
  bySeason: Record<string, number>;
  byOccasion: Record<string, number>;
  neverWorn: number;
  avgTrendiness: number | null;
};

type GapItem = {
  section: string;
  idealPct: number;
  actualPct: number;
  missingCount: number;
  severity: "critical" | "moderate" | "minor";
  icon: string;
  suggestions: Suggestion[];
};

type Suggestion = {
  title: string;
  description: string;
  priceRange: string;
  shoppingLinks: ShoppingLink[];
};

type ShoppingLink = {
  name: string;
  url: string;
  icon: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
  Tops: "👕", Bottoms: "👖", Dresses: "👗", Outerwear: "🧥",
  Footwear: "👟", Accessories: "👜", Ethnicwear: "🥻", Sportswear: "🏃",
};

const SECTION_COLOR: Record<string, string> = {
  Tops:       "from-violet-600/20 to-violet-600/5 border-violet-500/20",
  Bottoms:    "from-blue-600/20   to-blue-600/5   border-blue-500/20",
  Dresses:    "from-pink-600/20   to-pink-600/5   border-pink-500/20",
  Outerwear:  "from-slate-600/20  to-slate-600/5  border-slate-500/20",
  Footwear:   "from-amber-600/20  to-amber-600/5  border-amber-500/20",
  Accessories:"from-teal-600/20   to-teal-600/5   border-teal-500/20",
  Ethnicwear: "from-orange-600/20 to-orange-600/5 border-orange-500/20",
  Sportswear: "from-green-600/20  to-green-600/5  border-green-500/20",
};

const SECTION_SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400 bg-red-900/20 border-red-500/25",
  moderate: "text-amber-400 bg-amber-900/20 border-amber-500/25",
  minor:    "text-emerald-400 bg-emerald-900/20 border-emerald-500/25",
};

// Pre-built suggestions per section
const SECTION_SUGGESTIONS: Record<string, Suggestion[]> = {
  Tops: [
    {
      title: "Versatile White Button-Down Shirt",
      description: "A crisp white shirt that works for office, casual, and evening looks. The most versatile top you can own.",
      priceRange: "₹800–₹2,500",
      shoppingLinks: [
        { name: "Myntra", url: "https://www.myntra.com/shirts?q=white+formal+shirt", icon: "🛍" },
        { name: "H&M", url: "https://www2.hm.com/en_in/productpage.0879526006.html", icon: "👗" },
        { name: "Zara", url: "https://www.zara.com/in/en/search?searchTerm=white+shirt", icon: "✨" },
      ],
    },
    {
      title: "Classic Fitted T-Shirt (2-3 neutral colours)",
      description: "Black, white, and grey basics form the backbone of any wardrobe. Go for quality cotton.",
      priceRange: "₹300–₹1,200",
      shoppingLinks: [
        { name: "Uniqlo", url: "https://www.uniqlo.com/in/en/search?q=t-shirt", icon: "🎯" },
        { name: "H&M", url: "https://www2.hm.com/en_in/search-results.html?q=t-shirt+basic", icon: "👗" },
        { name: "Amazon", url: "https://www.amazon.in/s?k=plain+t+shirt+women", icon: "📦" },
      ],
    },
  ],
  Bottoms: [
    {
      title: "Well-Fitted Dark Jeans",
      description: "A pair of dark wash jeans that can dress up or down. Choose a straight or slim fit for maximum versatility.",
      priceRange: "₹1,500–₹4,000",
      shoppingLinks: [
        { name: "Levi's", url: "https://www.levi.com/IN/en_IN/clothing/women/jeans/c/levis_clothing_women_jeans", icon: "👖" },
        { name: "H&M", url: "https://www2.hm.com/en_in/search-results.html?q=dark+jeans", icon: "👗" },
        { name: "Myntra", url: "https://www.myntra.com/jeans?q=dark+jeans+women", icon: "🛍" },
      ],
    },
    {
      title: "Tailored Trousers / Wide-Leg Pants",
      description: "A smart trouser in neutral tones (beige, black, or olive) — a 2025 wardrobe essential.",
      priceRange: "₹1,200–₹3,500",
      shoppingLinks: [
        { name: "Zara", url: "https://www.zara.com/in/en/search?searchTerm=trousers+women", icon: "✨" },
        { name: "Marks & Spencer", url: "https://www.marksandspencer.com/in/l/womens/trousers", icon: "🏪" },
        { name: "Westside", url: "https://www.westside.com/collections/womens-trousers", icon: "🛍" },
      ],
    },
  ],
  Dresses: [
    {
      title: "Little Black Dress (LBD)",
      description: "The ultimate versatile piece — dress it up with heels and jewellery or down with sneakers.",
      priceRange: "₹1,500–₹5,000",
      shoppingLinks: [
        { name: "Zara", url: "https://www.zara.com/in/en/search?searchTerm=black+dress", icon: "✨" },
        { name: "H&M", url: "https://www2.hm.com/en_in/search-results.html?q=little+black+dress", icon: "👗" },
        { name: "Myntra", url: "https://www.myntra.com/dresses?q=little+black+dress", icon: "🛍" },
      ],
    },
    {
      title: "Flowy Summer Midi Dress",
      description: "Ideal for brunches, casual outings, and travel. Look for solid colours or subtle prints.",
      priceRange: "₹800–₹3,000",
      shoppingLinks: [
        { name: "Shein", url: "https://www.shein.in/dresses.html", icon: "🌸" },
        { name: "Global Desi", url: "https://www.global-desi.in/", icon: "🌺" },
        { name: "FabIndia", url: "https://www.fabindia.com/clothing/women/dresses", icon: "🪷" },
      ],
    },
  ],
  Outerwear: [
    {
      title: "Classic Blazer",
      description: "A structured blazer in black, camel, or navy instantly elevates any outfit — the #1 office staple.",
      priceRange: "₹2,000–₹8,000",
      shoppingLinks: [
        { name: "Zara", url: "https://www.zara.com/in/en/search?searchTerm=blazer+women", icon: "✨" },
        { name: "Mango", url: "https://www.mango.com/en_in/women/suits-blazers", icon: "🎭" },
        { name: "Myntra", url: "https://www.myntra.com/blazers?q=women+blazer", icon: "🛍" },
      ],
    },
    {
      title: "Lightweight Trench Coat / Denim Jacket",
      description: "Perfect for layering in transitional weather. A denim jacket or trench is a 2025 must-have.",
      priceRange: "₹1,500–₹6,000",
      shoppingLinks: [
        { name: "Levi's", url: "https://www.levi.com/IN/en_IN/clothing/women/jackets-vests/c/levis_clothing_women_jackets", icon: "👖" },
        { name: "H&M", url: "https://www2.hm.com/en_in/search-results.html?q=denim+jacket", icon: "👗" },
        { name: "Roadster", url: "https://www.myntra.com/jackets?q=roadster+denim+jacket", icon: "🚗" },
      ],
    },
  ],
  Footwear: [
    {
      title: "White Leather Sneakers",
      description: "The most versatile shoe you can own — pairs with everything from jeans to dresses.",
      priceRange: "₹2,000–₹8,000",
      shoppingLinks: [
        { name: "Nike", url: "https://www.myntra.com/Nike/shoes?q=white+sneakers+women", icon: "✔" },
        { name: "Puma", url: "https://in.puma.com/en/in/women/shoes", icon: "🐆" },
        { name: "New Balance", url: "https://www.newbalance.in/collections/women-shoes", icon: "👟" },
      ],
    },
    {
      title: "Block Heel Mules or Strappy Sandals",
      description: "A comfortable heel that works for formal and semi-formal occasions without sacrificing comfort.",
      priceRange: "₹1,200–₹4,000",
      shoppingLinks: [
        { name: "Zara", url: "https://www.zara.com/in/en/search?searchTerm=mules+women", icon: "✨" },
        { name: "Steve Madden", url: "https://www.stevemadden.in/collections/women-heels", icon: "👠" },
        { name: "Charles & Keith", url: "https://www.charleskeith.in/products/heels", icon: "👡" },
      ],
    },
  ],
  Accessories: [
    {
      title: "Quality Tote Bag",
      description: "A structured tote in black, tan, or white — works for work, shopping, and travel.",
      priceRange: "₹1,500–₹5,000",
      shoppingLinks: [
        { name: "Lavie", url: "https://laviebags.com/collections/tote-bags", icon: "👜" },
        { name: "Hidesign", url: "https://hidesign.com/collections/women-tote-bags", icon: "🌿" },
        { name: "Baggit", url: "https://baggit.com/collections/tote-bags", icon: "🎒" },
      ],
    },
    {
      title: "Classic Watch + Gold/Silver Jewellery Set",
      description: "Minimal everyday jewellery — stud earrings, a delicate necklace, and a simple watch elevate any look.",
      priceRange: "₹800–₹5,000",
      shoppingLinks: [
        { name: "Titan", url: "https://www.titan.co.in/women-watches.html", icon: "⌚" },
        { name: "Voylla", url: "https://www.voylla.com/", icon: "💍" },
        { name: "Pipa Bella", url: "https://www.myntra.com/pipa-bella/jewellery", icon: "✨" },
      ],
    },
  ],
  Ethnicwear: [
    {
      title: "Versatile Kurta Set (2-3 pieces)",
      description: "A well-fitted kurta in cotton or silk blend for everyday ethnic wear and festive occasions.",
      priceRange: "₹800–₹4,000",
      shoppingLinks: [
        { name: "FabIndia", url: "https://www.fabindia.com/clothing/women/kurtas", icon: "🪷" },
        { name: "W for Woman", url: "https://www.westside.com/collections/kurtas", icon: "🌸" },
        { name: "Global Desi", url: "https://www.global-desi.in/kurta-sets", icon: "🌺" },
      ],
    },
    {
      title: "Statement Saree or Lehenga",
      description: "One versatile festive outfit for weddings and celebrations — invest in quality fabric.",
      priceRange: "₹3,000–₹15,000",
      shoppingLinks: [
        { name: "Nalli Silks", url: "https://nalli.com/", icon: "🥻" },
        { name: "Utsav Fashion", url: "https://www.utsavfashion.com/", icon: "✨" },
        { name: "BIBA", url: "https://www.myntra.com/biba/ethnic-wear", icon: "🎭" },
      ],
    },
  ],
  Sportswear: [
    {
      title: "High-Performance Leggings",
      description: "Invest in a quality pair that moves with you — great for gym, yoga, running, and athleisure.",
      priceRange: "₹800–₹3,000",
      shoppingLinks: [
        { name: "Nike", url: "https://www.myntra.com/Nike/leggings", icon: "✔" },
        { name: "Adidas", url: "https://www.myntra.com/Adidas/leggings", icon: "🎯" },
        { name: "Reebok", url: "https://www.myntra.com/Reebok/leggings", icon: "💪" },
      ],
    },
    {
      title: "Sports Bra + Performance Top Set",
      description: "A supportive sports bra and a breathable moisture-wicking top for any workout.",
      priceRange: "₹600–₹2,500",
      shoppingLinks: [
        { name: "Nykaa Fashion", url: "https://www.nykaafashion.com/sports-bra", icon: "🌸" },
        { name: "Under Armour", url: "https://www.myntra.com/Under+Armour/sports-bra", icon: "🏋️" },
        { name: "Decathlon", url: "https://www.decathlon.in/sports-bra-l3073", icon: "🏃" },
      ],
    },
  ],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function computeGapItems(stats: WardrobeStats): GapItem[] {
  const gaps = stats.gapAnalysis.filter((g) => g.gap);
  return gaps.map((g) => {
    const missingCount = Math.max(
      1,
      Math.round(((g.idealPct - g.actualPct) / 100) * stats.total)
    );
    const diffPct = g.idealPct - g.actualPct;
    const severity: GapItem["severity"] =
      diffPct >= 10 ? "critical" : diffPct >= 5 ? "moderate" : "minor";
    return {
      section: g.section,
      idealPct: g.idealPct,
      actualPct: g.actualPct,
      missingCount,
      severity,
      icon: SECTION_ICONS[g.section] ?? "👗",
      suggestions: SECTION_SUGGESTIONS[g.section] ?? [],
    };
  }).sort((a, b) => {
    const order = { critical: 0, moderate: 1, minor: 2 };
    return order[a.severity] - order[b.severity];
  });
}

// ─── Components ───────────────────────────────────────────────────────────────

function GapBar({ actual, ideal }: { actual: number; ideal: number }) {
  const max = Math.max(actual, ideal, 5);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-white/30 w-10 text-right">{actual}%</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/8 relative overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-purple-500/60 transition-all"
            style={{ width: `${(actual / max) * 100}%` }}
          />
        </div>
        <span className="text-white/20 text-[9px]">you</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-white/15 w-10 text-right">{ideal}%</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/8 relative overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white/20 transition-all border-r border-dashed border-white/30"
            style={{ width: `${(ideal / max) * 100}%` }}
          />
        </div>
        <span className="text-white/20 text-[9px]">ideal</span>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div>
          <p className="text-white/80 text-sm font-medium">{suggestion.title}</p>
          <p className="text-white/35 text-xs mt-0.5">{suggestion.priceRange}</p>
        </div>
        <span className={`text-white/30 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-white/55 text-xs leading-relaxed">{suggestion.description}</p>
          <div className="flex flex-wrap gap-2">
            {suggestion.shoppingLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-900/20 border border-purple-700/20 text-purple-300 text-xs hover:bg-purple-900/35 transition-colors"
              >
                <span>{link.icon}</span>
                <span>{link.name}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GapCard({ gap }: { gap: GapItem }) {
  const colorClass = SECTION_COLOR[gap.section] ?? "from-slate-600/20 to-slate-600/5 border-slate-500/20";
  const severityClass = SECTION_SEVERITY_COLOR[gap.severity];

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${colorClass} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl bg-white/6 border border-white/8">
            {gap.icon}
          </div>
          <div>
            <h3 className="text-white font-semibold text-base">{gap.section}</h3>
            <p className="text-white/40 text-xs mt-0.5">
              Need ~{gap.missingCount} more item{gap.missingCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${severityClass} flex-shrink-0`}>
          {gap.severity === "critical" ? "🔴 Critical" : gap.severity === "moderate" ? "🟡 Moderate" : "🟢 Minor"}
        </span>
      </div>

      {/* Bar */}
      <GapBar actual={gap.actualPct} ideal={gap.idealPct} />

      {/* Suggestions */}
      {gap.suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-white/30 text-[10px] uppercase tracking-wider">What to get</p>
          {gap.suggestions.map((s, i) => (
            <SuggestionCard key={i} suggestion={s} />
          ))}
        </div>
      )}
    </div>
  );
}

function WardrobeHealthScore({ stats }: { stats: WardrobeStats }) {
  const totalGaps = stats.gapAnalysis.filter((g) => g.gap).length;
  const score = Math.round(((stats.gapAnalysis.length - totalGaps) / stats.gapAnalysis.length) * 100);
  const color =
    score >= 75 ? "text-emerald-400" :
    score >= 50 ? "text-amber-400"   :
                  "text-red-400";
  const ringColor =
    score >= 75 ? "#34d399" :
    score >= 50 ? "#fbbf24" :
                  "#f87171";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-5">
      {/* Ring */}
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
          <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <circle
            cx="40" cy="40" r="36" fill="none"
            stroke={ringColor} strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold ${color}`}>{score}%</span>
          <span className="text-[9px] text-white/25">health</span>
        </div>
      </div>
      {/* Info */}
      <div className="space-y-1.5">
        <p className="text-white font-semibold">Wardrobe Balance Score</p>
        <p className="text-white/45 text-xs leading-relaxed">
          {totalGaps === 0
            ? "Your wardrobe is perfectly balanced across all categories! 🎉"
            : `${totalGaps} gap${totalGaps !== 1 ? "s" : ""} detected across ${stats.gapAnalysis.length} categories.`}
        </p>
        <div className="flex gap-3 text-xs">
          <span className="text-white/40">{stats.total} total items</span>
          {stats.totalValue > 0 && (
            <span className="text-white/25">₹{stats.totalValue.toLocaleString()} value</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GapsPage() {
  const [stats, setStats] = useState<WardrobeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "critical" | "moderate" | "minor">("all");

  useEffect(() => {
    setLoading(true);
    api.get("/api/v1/stats")
      .then((r) => { setStats(r.data); setLoading(false); })
      .catch((e) => {
        setError(e?.response?.data?.error ?? e.message ?? "Failed to load wardrobe data");
        setLoading(false);
      });
  }, []);

  const gapItems = stats ? computeGapItems(stats) : [];
  const filteredGaps = filter === "all" ? gapItems : gapItems.filter((g) => g.severity === filter);
  const wellStocked = stats ? stats.gapAnalysis.filter((g) => !g.gap) : [];

  return (
    <div className="min-h-screen text-white">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>🔍</span> Gap Analysis
            </h1>
            <p className="text-white/40 text-sm mt-1">
              See what&apos;s missing from your wardrobe — with curated shopping recommendations
            </p>
          </div>
          <a
            href="/stats"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-sm transition-all"
          >
            📊 Full Stats →
          </a>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="w-12 h-12 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
            <p className="text-white/40 text-sm">Analysing your wardrobe…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        {/* Content */}
        {stats && !loading && (
          <>
            {/* Health score */}
            <div className="bg-gradient-to-br from-slate-800/60 to-slate-900/60 rounded-2xl border border-white/8 p-5">
              <WardrobeHealthScore stats={stats} />
            </div>

            {/* No gaps */}
            {gapItems.length === 0 && (
              <div className="text-center py-16 space-y-3">
                <p className="text-5xl">🌟</p>
                <p className="text-white font-semibold text-lg">Your wardrobe is perfectly balanced!</p>
                <p className="text-white/40 text-sm max-w-sm mx-auto">
                  All major categories are well-represented. Keep building your collection!
                </p>
              </div>
            )}

            {/* Gaps */}
            {gapItems.length > 0 && (
              <>
                {/* Filter pills */}
                <div className="flex flex-wrap gap-2">
                  {(["all", "critical", "moderate", "minor"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                        filter === f
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "border-white/10 text-white/40 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {f === "all" ? `All Gaps (${gapItems.length})` :
                       f === "critical" ? `🔴 Critical (${gapItems.filter((g) => g.severity === "critical").length})` :
                       f === "moderate" ? `🟡 Moderate (${gapItems.filter((g) => g.severity === "moderate").length})` :
                                          `🟢 Minor (${gapItems.filter((g) => g.severity === "minor").length})`}
                    </button>
                  ))}
                </div>

                {/* Gap cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  {filteredGaps.map((gap) => (
                    <GapCard key={gap.section} gap={gap} />
                  ))}
                </div>
              </>
            )}

            {/* Well-stocked sections */}
            {wellStocked.length > 0 && (
              <div className="rounded-2xl border border-white/6 bg-white/[0.015] p-5 space-y-3">
                <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider">✅ Well-Stocked Categories</h3>
                <div className="flex flex-wrap gap-2">
                  {wellStocked.map((w) => (
                    <div
                      key={w.section}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-900/15 border border-emerald-700/20"
                    >
                      <span>{SECTION_ICONS[w.section] ?? "👗"}</span>
                      <span className="text-emerald-300 text-xs font-medium">{w.section}</span>
                      <span className="text-emerald-400/50 text-[10px]">{w.actualPct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Occasion + season insights */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* By Occasion */}
              <div className="rounded-2xl border border-white/6 bg-white/[0.015] p-4 space-y-3">
                <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider">By Occasion</h3>
                <div className="space-y-2">
                  {Object.entries(stats.byOccasion)
                    .sort(([,a], [,b]) => b - a)
                    .map(([occ, count]) => {
                      const pct = Math.round((count / stats.total) * 100);
                      return (
                        <div key={occ} className="flex items-center gap-2">
                          <span className="text-white/50 text-xs w-16 truncate">{occ}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-purple-500/50"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-white/30 text-[10px] w-6 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
                {/* Occasion gap hint */}
                {!stats.byOccasion["Formal"] && !stats.byOccasion["formal"] && (
                  <p className="text-amber-400/70 text-xs">💡 No formal wear detected — consider adding a blazer or formal dress</p>
                )}
              </div>

              {/* By Season */}
              <div className="rounded-2xl border border-white/6 bg-white/[0.015] p-4 space-y-3">
                <h3 className="text-white/40 text-xs font-semibold uppercase tracking-wider">By Season</h3>
                <div className="space-y-2">
                  {Object.entries(stats.bySeason)
                    .sort(([,a], [,b]) => b - a)
                    .map(([season, count]) => {
                      const pct = Math.round((count / stats.total) * 100);
                      return (
                        <div key={season} className="flex items-center gap-2">
                          <span className="text-white/50 text-xs w-16 truncate">{season}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500/50"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-white/30 text-[10px] w-6 text-right">{pct}%</span>
                        </div>
                      );
                    })}
                </div>
                {/* Season gap hint */}
                {stats.bySeason["Winter"] === undefined && (
                  <p className="text-blue-400/70 text-xs">💡 No winter wear — consider a coat or warm layers</p>
                )}
              </div>
            </div>

            {/* Quick action footer */}
            <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/15 rounded-2xl border border-purple-700/20 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-white font-semibold text-sm">Ready to fill the gaps?</p>
                <p className="text-white/40 text-xs mt-0.5">
                  Add your new purchases to Wardrobe via the Describer — watch your balance score improve!
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <a
                  href="/describe"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all"
                >
                  🔮 Add Item
                </a>
                <a
                  href="/wardrobe"
                  className="px-4 py-2 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all"
                >
                  👗 Wardrobe
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
