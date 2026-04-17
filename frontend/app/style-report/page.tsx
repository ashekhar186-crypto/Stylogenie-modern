"use client";
// frontend/app/style-report/page.tsx
// Feature 22: Style Report — comprehensive downloadable PDF overview of the user's wardrobe
// Uses canvas-based PDF generation (jsPDF via CDN) with browser print fallback.

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/app/providers/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type WardrobeStats = {
  total: number;
  totalValue: number;
  neverWorn: number;
  inLaundry: number;
  avgTrendiness: number | null;
  bySection: Record<string, number>;
  bySeason: Record<string, number>;
  byOccasion: Record<string, number>;
  byTrend: Record<string, number>;
  topBrands: [string, number][];
  topColors: { hex: string; count: number }[];
  costPerWear: { id: string; price: number; wearCount: number; cpw: number }[];
  mostWorn: { id: string; wearCount: number }[];
  addedByMonth: Record<string, number>;
  gapAnalysis: { section: string; idealPct: number; actualPct: number; gap: boolean }[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
  Tops: "👕", Bottoms: "👖", Dresses: "👗", Outerwear: "🧥",
  Footwear: "👟", Accessories: "👜", Ethnicwear: "🥻", Sportswear: "🏃",
};

// ─── Print styles ─────────────────────────────────────────────────────────────

const PRINT_CSS = `
  @media print {
    body { background: white !important; color: #1a1a2e !important; }
    .no-print { display: none !important; }
    .print-page { page-break-after: always; }
    .print-avoid-break { page-break-inside: avoid; }
    @page { margin: 15mm; size: A4 portrait; }
  }
`;

// ─── Components ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl p-4 border ${color} print-avoid-break`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold mt-0.5 opacity-80">{label}</p>
      {sub && <p className="text-[10px] opacity-50 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionBar({ section, count, total, icon }: { section: string; count: number; total: number; icon: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-5 text-center text-sm">{icon}</span>
      <span className="text-sm w-24 text-white/70">{section}</span>
      <div className="flex-1 h-2 rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full bg-purple-500/60" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/40 w-8 text-right">{count}</span>
      <span className="text-[10px] text-white/25 w-7 text-right">{pct}%</span>
    </div>
  );
}

function ColorPaletteRow({ colors }: { colors: { hex: string; count: number }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.slice(0, 10).map(({ hex, count }) => (
        <div key={hex} className="flex flex-col items-center gap-1">
          <div
            className="w-9 h-9 rounded-lg border border-white/15 shadow-sm"
            style={{ backgroundColor: hex }}
            title={`${hex} (${count} items)`}
          />
          <span className="text-[9px] text-white/30">{count}</span>
        </div>
      ))}
    </div>
  );
}

function TrendBadge({ trend, count, rank }: { trend: string; count: number; rank: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-white/25 w-4">{rank}</span>
      <span className="flex-1 text-sm text-white/75">{trend}</span>
      <span className="text-xs text-purple-300/70 bg-purple-900/20 px-2 py-0.5 rounded-full border border-purple-700/20">
        {count} item{count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

function GapRow({ section, actualPct, idealPct, gap }: { section: string; actualPct: number; idealPct: number; gap: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-white/4 last:border-0">
      <span className="text-sm w-5">{SECTION_ICONS[section] ?? "👗"}</span>
      <span className="text-sm text-white/70 w-24">{section}</span>
      <div className="flex-1 flex items-center gap-1">
        <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
          <div className="h-full rounded-full bg-purple-500/50" style={{ width: `${actualPct}%` }} />
        </div>
        <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
          <div className="h-full rounded-full bg-white/15" style={{ width: `${idealPct}%` }} />
        </div>
      </div>
      <span className={`text-[10px] font-medium ${gap ? "text-red-400" : "text-emerald-400"}`}>
        {gap ? `↑ Need ${idealPct - actualPct}%` : "✓ Good"}
      </span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function StyleReportPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<WardrobeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  useEffect(() => {
    api.get("/api/v1/stats")
      .then((r) => { setStats(r.data); setLoading(false); })
      .catch((e) => {
        setError(e?.response?.data?.error ?? e.message ?? "Failed to load wardrobe data");
        setLoading(false);
      });
  }, []);

  async function handleDownload() {
    setGenerating(true);
    // Short delay to ensure state renders
    setTimeout(() => {
      window.print();
      setGenerating(false);
    }, 300);
  }

  const gapCount = stats?.gapAnalysis.filter((g) => g.gap).length ?? 0;
  const balanceScore = stats
    ? Math.round(((stats.gapAnalysis.length - gapCount) / Math.max(stats.gapAnalysis.length, 1)) * 100)
    : 0;
  const topTrend = stats
    ? Object.entries(stats.byTrend).sort(([,a], [,b]) => b - a)[0]?.[0] ?? "—"
    : "—";
  const topSection = stats
    ? Object.entries(stats.bySection).sort(([,a], [,b]) => b - a)[0]?.[0] ?? "—"
    : "—";

  return (
    <>
      {/* Print CSS injection */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="min-h-screen text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

          {/* Header — hidden when printing */}
          <div className="no-print flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span>📋</span> Style Report
              </h1>
              <p className="text-white/40 text-sm mt-1">
                Your complete wardrobe overview — ready to print or save as PDF
              </p>
            </div>
            <button
              onClick={handleDownload}
              disabled={loading || generating || !stats}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all disabled:opacity-50 shadow-lg shadow-purple-900/30"
            >
              {generating ? (
                <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Preparing…</>
              ) : (
                <><span>📥</span> Download PDF</>
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="no-print bg-rose-900/20 border border-rose-500/30 rounded-xl p-4 text-rose-300 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="no-print flex flex-col items-center py-20 gap-4">
              <div className="w-12 h-12 border-2 border-purple-500/40 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-white/40 text-sm">Loading your wardrobe data…</p>
            </div>
          )}

          {/* ═══ REPORT CONTENT ═══ */}
          {stats && !loading && (
            <div ref={reportRef} className="space-y-8">

              {/* ── Cover ── */}
              <div className="print-page rounded-2xl overflow-hidden" style={{
                background: "linear-gradient(135deg,#1a0a2e 0%,#0f0720 50%,#16082e 100%)",
                border: "1px solid rgba(139,92,246,0.15)",
              }}>
                <div className="p-8 md:p-12 space-y-6">
                  {/* Logo row */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                         style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", boxShadow: "0 4px 20px rgba(139,92,246,0.5)" }}>
                      🧞
                    </div>
                    <div>
                      <p className="font-bold text-white text-base tracking-wide">StyloGenie</p>
                      <p className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                         style={{ background: "linear-gradient(90deg,#a78bfa,#f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                        AI Fashion System
                      </p>
                    </div>
                  </div>

                  {/* Report title */}
                  <div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
                      Personal Style Report
                    </h2>
                    <p className="text-purple-300/70 text-lg mt-1">
                      {user?.name ?? "Wardrobe Owner"} · {today}
                    </p>
                  </div>

                  {/* Key stats row */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
                    <StatCard label="Total Items" value={stats.total} color="bg-purple-900/30 border-purple-700/20 text-purple-200" />
                    <StatCard
                      label="Wardrobe Value"
                      value={stats.totalValue > 0 ? `₹${stats.totalValue.toLocaleString()}` : "—"}
                      color="bg-pink-900/30 border-pink-700/20 text-pink-200"
                    />
                    <StatCard
                      label="Balance Score"
                      value={`${balanceScore}%`}
                      sub={`${gapCount} gap${gapCount !== 1 ? "s" : ""}`}
                      color="bg-emerald-900/30 border-emerald-700/20 text-emerald-200"
                    />
                    <StatCard
                      label="Avg Trendiness"
                      value={stats.avgTrendiness ? `${Math.round(stats.avgTrendiness * 100)}%` : "—"}
                      color="bg-amber-900/30 border-amber-700/20 text-amber-200"
                    />
                  </div>

                  {/* Highlight strip */}
                  <div className="grid sm:grid-cols-3 gap-3 pt-2">
                    <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-white/35 text-[10px] uppercase tracking-wider">Top Category</p>
                      <p className="text-white font-semibold mt-0.5">{SECTION_ICONS[topSection] ?? ""} {topSection}</p>
                    </div>
                    <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-white/35 text-[10px] uppercase tracking-wider">Dominant Trend</p>
                      <p className="text-white font-semibold mt-0.5 text-sm">✦ {topTrend}</p>
                    </div>
                    <div className="rounded-xl px-4 py-3 bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-white/35 text-[10px] uppercase tracking-wider">Never Worn</p>
                      <p className="text-white font-semibold mt-0.5">{stats.neverWorn} item{stats.neverWorn !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 1: Wardrobe Breakdown ── */}
              <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                <h3 className="text-white font-bold text-base flex items-center gap-2">
                  <span>👗</span> Wardrobe Breakdown
                </h3>
                <div className="space-y-1">
                  {Object.entries(stats.bySection)
                    .sort(([,a], [,b]) => b - a)
                    .map(([section, count]) => (
                      <SectionBar key={section} section={section} count={count} total={stats.total} icon={SECTION_ICONS[section] ?? "👗"} />
                    ))}
                </div>
              </div>

              {/* ── Section 2: Colour Palette ── */}
              {stats.topColors.length > 0 && (
                <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-4">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    <span>🎨</span> Dominant Colour Palette
                  </h3>
                  <ColorPaletteRow colors={stats.topColors} />
                  <p className="text-white/30 text-xs">
                    Your wardrobe is dominated by {stats.topColors.slice(0, 3).map((c) => c.hex).join(", ")} tones.
                    {stats.topColors[0]?.hex && (
                      ` Your signature colour appears in ${stats.topColors[0].count} of ${stats.total} items.`
                    )}
                  </p>
                </div>
              )}

              {/* ── Section 3: Season & Occasion ── */}
              <div className="grid sm:grid-cols-2 gap-4 print-avoid-break">
                {/* Season */}
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 space-y-3">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">☀️ By Season</h3>
                  <div className="space-y-1">
                    {Object.entries(stats.bySeason)
                      .sort(([,a], [,b]) => b - a)
                      .map(([season, count]) => {
                        const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                        return (
                          <div key={season} className="flex items-center gap-2 py-0.5">
                            <span className="text-xs text-white/55 w-16 truncate">{season}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                              <div className="h-full rounded-full bg-blue-500/50" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-white/30 w-6 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Occasion */}
                <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 space-y-3">
                  <h3 className="text-white font-bold text-sm flex items-center gap-2">🎯 By Occasion</h3>
                  <div className="space-y-1">
                    {Object.entries(stats.byOccasion)
                      .sort(([,a], [,b]) => b - a)
                      .map(([occ, count]) => {
                        const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                        return (
                          <div key={occ} className="flex items-center gap-2 py-0.5">
                            <span className="text-xs text-white/55 w-16 truncate">{occ}</span>
                            <div className="flex-1 h-1.5 rounded-full bg-white/6 overflow-hidden">
                              <div className="h-full rounded-full bg-purple-500/50" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-white/30 w-6 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* ── Section 4: 2025 Trend Profile ── */}
              {Object.keys(stats.byTrend).length > 0 && (
                <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">✦ 2025 Trend DNA</h3>
                  <div>
                    {Object.entries(stats.byTrend)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 8)
                      .map(([trend, count], i) => (
                        <TrendBadge key={trend} trend={trend} count={count} rank={i + 1} />
                      ))}
                  </div>
                </div>
              )}

              {/* ── Section 5: Top Brands ── */}
              {stats.topBrands.length > 0 && (
                <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">🏷️ Brand Profile</h3>
                  <div className="flex flex-wrap gap-2">
                    {stats.topBrands.map(([brand, count]) => (
                      <div key={brand} className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center gap-1.5">
                        <span className="text-white/70 text-sm font-medium">{brand}</span>
                        <span className="text-white/25 text-xs">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Section 6: Gap Analysis ── */}
              <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    🔍 Wardrobe Balance
                  </h3>
                  <span className={`text-sm font-bold px-3 py-1 rounded-full border ${
                    balanceScore >= 75 ? "text-emerald-400 bg-emerald-900/20 border-emerald-700/20" :
                    balanceScore >= 50 ? "text-amber-400 bg-amber-900/20 border-amber-700/20"      :
                                         "text-red-400 bg-red-900/20 border-red-700/20"
                  }`}>
                    {balanceScore}% balanced
                  </span>
                </div>
                <div>
                  {stats.gapAnalysis.map((g) => (
                    <GapRow key={g.section} section={g.section} actualPct={g.actualPct} idealPct={g.idealPct} gap={g.gap} />
                  ))}
                </div>
                {gapCount > 0 && (
                  <p className="text-amber-400/70 text-xs pt-1">
                    💡 Visit the Gap Analysis page for curated shopping recommendations to fill {gapCount} gap{gapCount !== 1 ? "s" : ""}.
                  </p>
                )}
              </div>

              {/* ── Section 7: Cost Per Wear ── */}
              {stats.costPerWear.length > 0 && (
                <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">💰 Best Value Items (Cost Per Wear)</h3>
                  <div className="space-y-1.5">
                    {stats.costPerWear.slice(0, 5).map((item, i) => (
                      <div key={item.id} className="flex items-center gap-3 py-1 border-b border-white/4 last:border-0">
                        <span className="text-white/25 text-xs w-4">{i + 1}</span>
                        <div className="flex-1">
                          <p className="text-white/60 text-xs">Item {item.id.slice(-6)}</p>
                          <p className="text-white/30 text-[10px]">{item.wearCount}× worn · ₹{item.price.toLocaleString()}</p>
                        </div>
                        <span className="text-emerald-400 font-semibold text-sm">₹{Math.round(item.cpw)} / wear</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Growth Chart ── */}
              {Object.keys(stats.addedByMonth).length > 0 && (
                <div className="print-avoid-break rounded-2xl border border-white/8 bg-white/[0.02] p-6 space-y-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">📈 Wardrobe Growth (Last 12 Months)</h3>
                  <div className="flex items-end gap-1 h-20">
                    {Object.entries(stats.addedByMonth).map(([month, count]) => {
                      const max = Math.max(...Object.values(stats.addedByMonth), 1);
                      const h = (count / max) * 100;
                      return (
                        <div key={month} className="flex-1 flex flex-col items-center gap-1" title={`${month}: ${count} items`}>
                          <div className="w-full rounded-t-sm bg-purple-500/40 hover:bg-purple-500/60 transition-all"
                               style={{ height: `${Math.max(h, count > 0 ? 8 : 2)}%`, minHeight: count > 0 ? "4px" : "2px" }} />
                          <span className="text-[7px] text-white/20 writing-mode-vertical">{month.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Footer / Recommendations ── */}
              <div className="rounded-2xl border border-purple-700/20 bg-gradient-to-br from-purple-900/20 to-pink-900/10 p-6 space-y-3 print-avoid-break">
                <h3 className="text-white font-bold text-base">💡 Genie&apos;s Recommendations</h3>
                <div className="space-y-2 text-sm text-white/65 leading-relaxed">
                  {stats.neverWorn > 0 && (
                    <p>• You have <strong className="text-amber-300">{stats.neverWorn} unworn item{stats.neverWorn !== 1 ? "s" : ""}</strong> — try the Outfit Studio to find ways to wear them.</p>
                  )}
                  {gapCount > 0 && (
                    <p>• Your wardrobe has <strong className="text-red-300">{gapCount} category gap{gapCount !== 1 ? "s" : ""}</strong> — visit the Gap Analysis page for curated shopping recommendations.</p>
                  )}
                  {stats.avgTrendiness !== null && stats.avgTrendiness >= 0.75 && (
                    <p>• Your wardrobe trendiness score is <strong className="text-emerald-300">{Math.round(stats.avgTrendiness * 100)}%</strong> — you&apos;re ahead of the trend curve! 🔥</p>
                  )}
                  {stats.topColors.length >= 3 && (
                    <p>• Your signature palette features {stats.topColors.slice(0, 3).map((c) => c.hex).join(", ")} — consider building more outfits around these hero colours.</p>
                  )}
                  {stats.topBrands.length >= 2 && (
                    <p>• Your most-worn brands are <strong className="text-purple-300">{stats.topBrands.slice(0, 2).map(([b]) => b).join(" and ")}</strong> — explore their new collections for on-brand additions.</p>
                  )}
                  <p>• Use the Trip Planner to maximise outfit combinations when you travel.</p>
                </div>

                {/* Footer meta */}
                <div className="border-t border-white/8 pt-3 flex items-center justify-between">
                  <p className="text-white/20 text-xs">Generated by StyloGenie AI Fashion System · {today}</p>
                  <p className="text-white/15 text-xs">stylogenie.com</p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
