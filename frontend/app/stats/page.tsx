"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { WardrobeStats } from "@/lib/types";

// ─── Mini Bar ─────────────────────────────────────────────────
function Bar({ value, max, color = "bg-purple-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 bg-white/6 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-white/40 text-xs w-6 text-right">{value}</span>
    </div>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────
function StatCard({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub?: string }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-4 space-y-1">
      <div className="text-2xl">{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-sm text-white/60">{label}</div>
      {sub && <div className="text-xs text-white/30">{sub}</div>}
    </div>
  );
}

// ─── Section breakdown ─────────────────────────────────────────
function SectionBreakdown({ bySection }: { bySection: Record<string, number> }) {
  const total = Object.values(bySection).reduce((s, v) => s + v, 0);
  const ICONS: Record<string, string> = {
    Tops: "👕", Bottoms: "👖", Dresses: "👗", Outerwear: "🧥",
    Footwear: "👟", Accessories: "👜", Ethnicwear: "🥻", Sportswear: "🏃",
  };
  const entries = Object.entries(bySection).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">By Category</h3>
      <div className="space-y-3">
        {entries.map(([section, count]) => (
          <div key={section}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/70 text-xs flex items-center gap-1.5">
                <span>{ICONS[section] ?? "👔"}</span>{section}
              </span>
              <span className="text-white/30 text-xs">{total > 0 ? Math.round(count / total * 100) : 0}%</span>
            </div>
            <Bar value={count} max={max} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Gap Analysis ─────────────────────────────────────────────
function GapAnalysis({ gapAnalysis }: { gapAnalysis: WardrobeStats["gapAnalysis"] }) {
  const gaps = gapAnalysis.filter((g) => g.gap);
  if (gaps.length === 0) return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-2">Wardrobe Gaps</h3>
      <p className="text-green-400 text-sm">Your wardrobe is well-balanced! ✦</p>
    </div>
  );

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Wardrobe Gaps</h3>
      <p className="text-white/40 text-xs mb-3">These categories are under-represented in your closet:</p>
      <div className="space-y-2">
        {gaps.map((g) => (
          <div key={g.section} className="flex items-center justify-between bg-amber-900/20 border border-amber-700/20 rounded-xl px-3 py-2">
            <span className="text-amber-200 text-sm font-medium">{g.section}</span>
            <div className="text-right">
              <span className="text-amber-400/70 text-xs">You have {g.actualPct}%</span>
              <span className="text-white/30 text-xs ml-1">· ideal {g.idealPct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Monthly growth ─────────────────────────────────────────────
function MonthlyGrowth({ addedByMonth }: { addedByMonth: Record<string, number> }) {
  const entries = Object.entries(addedByMonth);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Items Added (Last 12 Months)</h3>
      <div className="flex items-end gap-1 h-20">
        {entries.map(([month, count]) => {
          const h = max > 0 ? Math.round((count / max) * 100) : 0;
          const short = month.slice(5); // "MM"
          return (
            <div key={month} className="flex-1 flex flex-col items-center gap-1 group">
              <div
                className="w-full rounded-t-sm bg-purple-600/60 group-hover:bg-purple-500 transition-all relative"
                style={{ height: `${Math.max(h, count > 0 ? 4 : 2)}%` }}
              >
                {count > 0 && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                    {count}
                  </div>
                )}
              </div>
              <span className="text-white/20 text-[8px]">{short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Color palette ─────────────────────────────────────────────
function ColorPalette({ topColors }: { topColors: { hex: string; count: number }[] }) {
  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Dominant Color Palette</h3>
      <div className="flex gap-2 flex-wrap">
        {topColors.map(({ hex, count }) => (
          <div key={hex} className="flex flex-col items-center gap-1 group">
            <div
              className="w-10 h-10 rounded-xl border border-white/10 shadow-lg cursor-pointer group-hover:scale-110 transition-transform"
              style={{ background: hex }}
              title={`${hex} (${count} items)`}
            />
            <span className="text-white/25 text-[8px]">{count}</span>
          </div>
        ))}
      </div>
      {topColors.length === 0 && (
        <p className="text-white/30 text-sm">No color data yet. Classify some items first.</p>
      )}
    </div>
  );
}

// ─── Trend breakdown ─────────────────────────────────────────────
function TrendBreakdown({ byTrend }: { byTrend: Record<string, number> }) {
  const entries = Object.entries(byTrend).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = entries[0]?.[1] ?? 1;
  const TREND_COLORS: Record<string, string> = {
    "Quiet Luxury": "bg-slate-400",
    "Ballet Core": "bg-pink-400",
    "Dark Feminine": "bg-purple-500",
    "Office Siren": "bg-amber-400",
    "Y2K Revival": "bg-cyan-400",
    "Ethnic Couture": "bg-orange-400",
    "Cottagecore": "bg-green-400",
    "Streetwear": "bg-red-400",
  };

  if (entries.length === 0) return null;

  return (
    <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
      <h3 className="text-white font-semibold text-sm mb-4">2025 Micro-Trends in Your Wardrobe</h3>
      <div className="space-y-3">
        {entries.map(([trend, count]) => (
          <div key={trend}>
            <div className="flex justify-between mb-1">
              <span className="text-white/70 text-xs">{trend}</span>
              <span className="text-white/30 text-xs">{count}</span>
            </div>
            <Bar value={count} max={max} color={TREND_COLORS[trend] ?? "bg-purple-500"} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function StatsPage() {
  const [stats, setStats]   = useState<WardrobeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    api.get("/api/v1/stats")
      .then((r) => { setStats(r.data); setError(null); })
      .catch((e) => {
        const msg = e?.response?.data?.error ?? e?.message ?? "Failed to load stats";
        setError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="space-y-2 text-center">
          <div className="text-4xl animate-pulse">📊</div>
          <p className="text-white/40 text-sm">Crunching your wardrobe data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto pt-8">
        <div className="bg-rose-900/20 border border-rose-500/30 rounded-xl p-5 flex items-start gap-3">
          <span className="text-rose-400 text-xl flex-shrink-0">⚠️</span>
          <div>
            <p className="text-rose-300 font-semibold text-sm">Failed to load stats</p>
            <p className="text-rose-200/60 text-xs mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const cpwItems = stats.costPerWear.slice(0, 5);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl w-8 h-8 flex items-center justify-center text-base shadow-lg">📊</span>
            Wardrobe Stats
          </h1>
          <p className="text-white/40 text-sm mt-0.5 ml-10">Your style data, visualized</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/gaps" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-xs transition-all">
            🔍 Gap Analysis
          </a>
          <a href="/style-report" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-500/30 bg-purple-900/20 text-purple-300 hover:bg-purple-900/40 text-xs transition-all">
            📋 Download Report
          </a>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon="👗" value={stats.total} label="Total Items" />
        <StatCard
          icon="💰"
          value={stats.totalValue > 0 ? `₹${stats.totalValue.toLocaleString("en-IN")}` : "—"}
          label="Wardrobe Value"
          sub={stats.totalValue > 0 ? "estimated" : "Add prices to items"}
        />
        <StatCard
          icon="😴"
          value={stats.neverWorn}
          label="Never Worn"
          sub={stats.total > 0 ? `${Math.round(stats.neverWorn / stats.total * 100)}% of closet` : undefined}
        />
        <StatCard
          icon="✨"
          value={stats.avgTrendiness != null ? `${Math.round(stats.avgTrendiness * 100)}%` : "—"}
          label="2025 Trendiness"
          sub="Average across closet"
        />
      </div>

      {/* Row 2: section + monthly */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionBreakdown bySection={stats.bySection} />
        <MonthlyGrowth addedByMonth={stats.addedByMonth} />
      </div>

      {/* Row 3: colors + trends */}
      <div className="grid md:grid-cols-2 gap-4">
        <ColorPalette topColors={stats.topColors} />
        <TrendBreakdown byTrend={stats.byTrend} />
      </div>

      {/* Row 4: gaps + cost per wear */}
      <div className="grid md:grid-cols-2 gap-4">
        <GapAnalysis gapAnalysis={stats.gapAnalysis} />

        {cpwItems.length > 0 ? (
          <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-4">Best Cost Per Wear</h3>
            <p className="text-white/40 text-xs mb-3">Most value from your wardrobe investments:</p>
            <div className="space-y-2">
              {cpwItems.map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between bg-white/3 rounded-xl px-3 py-2">
                  <span className="text-white/50 text-xs">#{idx + 1}</span>
                  <div className="text-right">
                    <div className="text-green-400 text-sm font-semibold">₹{item.cpw.toFixed(0)}/wear</div>
                    <div className="text-white/30 text-xs">₹{item.price} · {item.wearCount} wears</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
            <h3 className="text-white font-semibold text-sm mb-3">Cost Per Wear</h3>
            <p className="text-white/30 text-sm">Add prices to your items and log wears in the wardrobe to see cost-per-wear stats.</p>
          </div>
        )}
      </div>

      {/* Occasion breakdown */}
      {Object.keys(stats.byOccasion).length > 0 && (
        <div className="bg-white/4 border border-white/8 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-4">By Occasion</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byOccasion).sort((a, b) => b[1] - a[1]).map(([occ, count]) => (
              <div key={occ} className="bg-white/6 border border-white/10 rounded-full px-3 py-1 flex items-center gap-1.5">
                <span className="text-white/70 text-sm">{occ}</span>
                <span className="text-white/30 text-xs">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Laundry indicator */}
      {stats.inLaundry > 0 && (
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-2xl px-5 py-3 flex items-center gap-3">
          <span className="text-xl">🧺</span>
          <div>
            <span className="text-blue-300 font-medium text-sm">{stats.inLaundry} item{stats.inLaundry > 1 ? "s" : ""} in laundry</span>
            <p className="text-blue-400/50 text-xs">These are excluded from outfit recommendations</p>
          </div>
        </div>
      )}
    </div>
  );
}
