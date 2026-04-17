"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type SavedPlan = {
  id: string;
  destination: string;
  startDate?: string | null;
  endDate?: string | null;
  bagType?: string | null;
  weatherSummary?: string | null;
  styleNotes?: string | null;
  avoidItems: string[];
  packingList?: any;
  dailyOutfits?: any[];
  checkedItems: string[];
  createdAt: string;
};

// ─── Checklist item ────────────────────────────────────────────
function CheckItem({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer group">
      <div
        onClick={() => onChange(!checked)}
        className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all
          ${checked ? "bg-purple-600 border-purple-600" : "border-white/20 group-hover:border-purple-400/50"}`}
      >
        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <span className={`text-sm transition-colors ${checked ? "text-white/30 line-through" : "text-white/70 group-hover:text-white"}`}>{label}</span>
    </label>
  );
}

// ─── Packing checklist panel ───────────────────────────────────
function PackingChecklist({ plan, onUpdate }: { plan: SavedPlan; onUpdate: (checked: string[]) => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(plan.checkedItems));

  function toggle(item: string) {
    const next = new Set(checked);
    if (next.has(item)) next.delete(item); else next.add(item);
    setChecked(next);
    onUpdate([...next]);
  }

  const pl = plan.packingList as Record<string, string[]> | null;
  if (!pl) return <p className="text-white/30 text-sm">No packing list available.</p>;

  const ICONS: Record<string, string> = { tops: "👕", bottoms: "👖", dresses: "👗", outerwear: "🧥", footwear: "👟", accessories: "👜", essentials: "🧴" };
  const allItems = Object.entries(pl).flatMap(([cat, items]) => items.map((item) => `${cat}::${item}`));
  const doneCount = allItems.filter((k) => checked.has(k)).length;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-white/6 rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full bg-purple-500 transition-all duration-300"
            style={{ width: allItems.length > 0 ? `${Math.round(doneCount / allItems.length * 100)}%` : "0%" }}
          />
        </div>
        <span className="text-white/40 text-xs">{doneCount}/{allItems.length} packed</span>
      </div>

      {Object.entries(pl).map(([cat, items]) => {
        if (!items || items.length === 0) return null;
        return (
          <div key={cat}>
            <h5 className="text-white/50 text-xs font-medium uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>{ICONS[cat] ?? "📦"}</span>{cat}
            </h5>
            <div className="space-y-2">
              {items.map((item) => (
                <CheckItem
                  key={item}
                  label={item}
                  checked={checked.has(`${cat}::${item}`)}
                  onChange={() => toggle(`${cat}::${item}`)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Plan card ────────────────────────────────────────────────
function PlanCard({ plan, onDelete, onSelect, isSelected }: {
  plan: SavedPlan;
  onDelete: () => void;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const dayCount = plan.dailyOutfits?.length ?? 0;
  const dateLabel = plan.startDate && plan.endDate ? `${plan.startDate} → ${plan.endDate}` : plan.startDate ?? "Dates not set";

  return (
    <div className={`border rounded-2xl p-4 transition-all cursor-pointer ${isSelected ? "border-purple-500 bg-purple-600/10" : "border-white/8 bg-white/3 hover:border-white/20"}`}
      onClick={onSelect}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-white font-semibold">{plan.destination}</h3>
          <p className="text-white/40 text-xs mt-0.5">{dateLabel}</p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-white/20 hover:text-rose-400 transition-colors text-xs px-2 py-1 rounded-lg hover:bg-rose-900/20"
        >
          Delete
        </button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {plan.bagType && (
          <span className="bg-white/6 rounded-full px-2 py-0.5 text-white/50">🎒 {plan.bagType}</span>
        )}
        {dayCount > 0 && (
          <span className="bg-purple-600/20 text-purple-300 rounded-full px-2 py-0.5">{dayCount} day outfit{dayCount > 1 ? "s" : ""}</span>
        )}
        {plan.checkedItems.length > 0 && (
          <span className="bg-green-900/30 text-green-400 rounded-full px-2 py-0.5">
            {plan.checkedItems.length} packed ✓
          </span>
        )}
      </div>

      {plan.weatherSummary && (
        <p className="text-white/30 text-xs mt-2 leading-relaxed line-clamp-2">{plan.weatherSummary}</p>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────
export default function TripsPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SavedPlan | null>(null);

  async function fetchPlans() {
    try {
      const r = await api.get("/api/v1/trip/plans");
      setPlans(r.data.plans ?? []);
    } catch {
      toast.error("Failed to load trip plans");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlans(); }, []);

  async function deletePlan(id: string) {
    try {
      await api.delete(`/api/v1/trip/plans/${id}`);
      toast.success("Trip deleted");
      if (selected?.id === id) setSelected(null);
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function updateChecklist(planId: string, checkedItems: string[]) {
    try {
      await api.patch(`/api/v1/trip/plans/${planId}/checklist`, { checkedItems });
      setPlans((prev) => prev.map((p) => p.id === planId ? { ...p, checkedItems } : p));
      if (selected?.id === planId) setSelected((prev) => prev ? { ...prev, checkedItems } : prev);
    } catch {
      toast.error("Failed to save checklist");
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center space-y-2">
        <div className="text-4xl animate-pulse">✈️</div>
        <p className="text-white/40 text-sm">Loading your trips…</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-br from-violet-500 to-purple-700 rounded-xl w-8 h-8 flex items-center justify-center text-base shadow-lg">✈️</span>
            Saved Trips
          </h1>
          <p className="text-white/40 text-sm mt-0.5 ml-10">Your travel plans with interactive packing checklists</p>
        </div>
        <button
          onClick={() => router.push("/trip-planner")}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-xl font-medium transition-all shadow-lg shadow-purple-900/30"
        >
          + New Trip
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="text-center py-16 space-y-4">
          <div className="text-6xl">🌍</div>
          <p className="text-white/50 text-lg font-medium">No trips planned yet</p>
          <p className="text-white/25 text-sm">Use the Trip Planner to create AI-powered packing lists for your travels.</p>
          <button onClick={() => router.push("/trip-planner")} className="mt-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium transition-all">
            Plan a Trip
          </button>
        </div>
      ) : (
        <div className={`grid ${selected ? "md:grid-cols-[1fr_380px]" : "grid-cols-1 sm:grid-cols-2"} gap-4`}>
          {/* Plan list */}
          <div className={`space-y-3 ${selected ? "" : ""}`}>
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onDelete={() => deletePlan(plan.id)}
                onSelect={() => setSelected(prev => prev?.id === plan.id ? null : plan)}
                isSelected={selected?.id === plan.id}
              />
            ))}
          </div>

          {/* Detail / Checklist panel */}
          {selected && (
            <div className="bg-slate-800/80 border border-white/10 rounded-2xl p-5 space-y-5 self-start">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-white font-bold text-base">{selected.destination}</h2>
                  <p className="text-white/30 text-xs">{selected.startDate} → {selected.endDate}</p>
                </div>
                <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white/60 text-xl">×</button>
              </div>

              {/* Daily outfits */}
              {selected.dailyOutfits && selected.dailyOutfits.length > 0 && (
                <div>
                  <h4 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-3">Daily Outfits</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {selected.dailyOutfits.map((day: any) => (
                      <div key={day.day} className="bg-white/4 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-purple-400 text-xs font-medium">Day {day.day}</span>
                          <span className="text-white/30 text-xs">{day.type}</span>
                        </div>
                        <p className="text-white/60 text-xs leading-relaxed">{day.outfit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Packing checklist */}
              <div>
                <h4 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-3">Packing Checklist</h4>
                <PackingChecklist
                  plan={selected}
                  onUpdate={(checked) => updateChecklist(selected.id, checked)}
                />
              </div>

              {/* Style notes */}
              {selected.styleNotes && (
                <div>
                  <h4 className="text-white/60 text-xs font-medium uppercase tracking-wider mb-2">Style Notes</h4>
                  <p className="text-white/50 text-sm leading-relaxed">{selected.styleNotes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
