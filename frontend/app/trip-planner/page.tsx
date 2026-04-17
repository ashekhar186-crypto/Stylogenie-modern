"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import axios from "axios";
import { api } from "@/lib/api";
import type {
  TripPlan, BookingLinks, UserStyleProfile,
  ShoppingListItem, WardrobeMatch, DailyOutfit,
  DiscoverDestination, DiscoverResponse, DestinationBudget,
} from "@/lib/types";

function extractErr(e: unknown): string {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message;
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

const BAG_TYPES = ["Backpack", "Cabin Trolley", "Large Suitcase", "Duffle Bag", "Tote Bag", "Multi-bag"];
const BAG_SIZES = ["7kg (hand luggage)", "15kg", "20kg", "23kg", "30kg+", "No limit"];

const INTEREST_OPTIONS = [
  { value: "mountains", label: "🏔️ Mountains" },
  { value: "beach", label: "🏖️ Beach" },
  { value: "culture", label: "🏛️ Culture" },
  { value: "food", label: "🍜 Food" },
  { value: "adventure", label: "🧗 Adventure" },
  { value: "wildlife", label: "🦁 Wildlife" },
  { value: "history", label: "🏰 History" },
  { value: "nightlife", label: "🌃 Nightlife" },
  { value: "spiritual", label: "🕌 Spiritual" },
  { value: "shopping", label: "🛍️ Shopping" },
  { value: "nature", label: "🌿 Nature" },
  { value: "photography", label: "📷 Photography" },
];

/* ─── Color swatch dot ─── */
function ColorDot({ color, size = "sm" }: { color: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  const cssMap: Record<string, string> = {
    black: "#111", white: "#f5f5f5", navy: "#1e3a5f", grey: "#9ca3af", gray: "#9ca3af",
    beige: "#d4b896", brown: "#795548", red: "#ef4444", blue: "#3b82f6", green: "#22c55e",
    yellow: "#eab308", orange: "#f97316", pink: "#ec4899", purple: "#a855f7",
    olive: "#6b7c3c", cream: "#fffdd0", tan: "#d2b48c", maroon: "#800000",
    teal: "#14b8a6", coral: "#ff6b6b", mint: "#98e4c0", lavender: "#e6d5f7",
    mustard: "#e3a008", rust: "#c0542c", indigo: "#4f46e5", rose: "#f43f5e",
    sage: "#8fae9b", camel: "#c19a6b",
  };
  const bg = cssMap[color.toLowerCase()] ?? color;
  return (
    <div
      className={`${sz} rounded-full border border-white/20 flex-shrink-0`}
      style={{ backgroundColor: bg }}
      title={color}
    />
  );
}

/* ─── Style Profile Card ─── */
function StyleProfileCard({ profile, tripProfile }: {
  profile: UserStyleProfile;
  tripProfile?: TripPlan["styleProfile"];
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-900/30 via-purple-900/20 to-slate-800/50 border border-purple-700/20 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-widest mb-1">Your Style Profile</p>
          <p className="text-white font-bold text-sm">{profile.description}</p>
        </div>
        <div className="text-2xl flex-shrink-0">🎨</div>
      </div>
      <div>
        <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Wardrobe Color DNA</p>
        <div className="flex items-center gap-2 flex-wrap">
          {profile.dominantColors.map((c) => (
            <div key={c} className="flex items-center gap-1.5 bg-white/5 rounded-full pl-1.5 pr-3 py-1 border border-white/10">
              <ColorDot color={c} size="sm" />
              <span className="text-white text-xs capitalize">{c}</span>
            </div>
          ))}
          {profile.accentColors.map((c) => (
            <div key={c} className="flex items-center gap-1.5 bg-white/5 rounded-full pl-1.5 pr-3 py-1 border border-white/5 opacity-60">
              <ColorDot color={c} size="sm" />
              <span className="text-white text-xs capitalize">{c}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {profile.preferredStyleEras.length > 0 && (
          <div className="bg-white/5 rounded-xl px-3 py-2">
            <p className="text-white/30 text-[9px] uppercase tracking-wider mb-1">Style Era</p>
            <p className="text-white text-xs capitalize">{profile.preferredStyleEras.slice(0, 2).join(" · ")}</p>
          </div>
        )}
        {profile.preferredFits.length > 0 && (
          <div className="bg-white/5 rounded-xl px-3 py-2">
            <p className="text-white/30 text-[9px] uppercase tracking-wider mb-1">Preferred Fit</p>
            <p className="text-white text-xs capitalize">{profile.preferredFits[0]}</p>
          </div>
        )}
        {profile.preferredMaterials.length > 0 && (
          <div className="bg-white/5 rounded-xl px-3 py-2">
            <p className="text-white/30 text-[9px] uppercase tracking-wider mb-1">Fav Materials</p>
            <p className="text-white text-xs capitalize">{profile.preferredMaterials.slice(0, 2).join(", ")}</p>
          </div>
        )}
        <div className="bg-white/5 rounded-xl px-3 py-2">
          <p className="text-white/30 text-[9px] uppercase tracking-wider mb-1">Wardrobe Size</p>
          <p className="text-white text-xs">{profile.totalItems} classified items</p>
        </div>
      </div>
      {tripProfile?.tripColorPalette && (
        <div className="border-t border-white/5 pt-4">
          <p className="text-white/40 text-[10px] uppercase tracking-wider mb-2">Recommended Trip Palette</p>
          <div className="flex items-center gap-2 mb-2">
            {tripProfile.tripColorPalette.map((c) => (
              <div key={c} className="flex items-center gap-1.5 bg-white/5 rounded-full pl-1.5 pr-3 py-1 border border-white/10">
                <ColorDot color={c} size="sm" />
                <span className="text-white text-xs capitalize">{c}</span>
              </div>
            ))}
          </div>
          {tripProfile.tripColorReason && (
            <p className="text-white/50 text-xs italic">{tripProfile.tripColorReason}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Wardrobe Matches Panel ─── */
function WardrobeMatchPanel({ matches }: { matches: WardrobeMatch[] }) {
  if (!matches?.length) return (
    <div className="rounded-2xl bg-slate-800/40 border border-white/5 p-5 text-center">
      <p className="text-3xl mb-2">🧺</p>
      <p className="text-white/40 text-sm">No matching wardrobe items found for this trip.</p>
      <p className="text-white/25 text-xs mt-1">Add classified items to your wardrobe first.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">
          ✅ {matches.length} items from your wardrobe
        </p>
        <span className="text-green-400 text-[10px] bg-green-900/20 px-2 py-0.5 rounded-full border border-green-800/30">Already owned</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {matches.map((m, i) => (
          <div key={i} className="bg-slate-800/60 rounded-2xl border border-green-800/20 p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-white font-medium text-sm leading-tight">{m.itemTitle}</p>
              <span className="text-green-400 text-[9px] font-bold bg-green-900/20 px-1.5 py-0.5 rounded-md flex-shrink-0">{m.wardrobeCode}</span>
            </div>
            <p className="text-white/60 text-xs leading-relaxed">{m.packReason}</p>
            {m.usageDays?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {m.usageDays.map((d, j) => (
                  <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/5">{d}</span>
                ))}
              </div>
            )}
            {m.stylingTip && (
              <div className="border-l-2 border-purple-500/30 pl-2.5">
                <p className="text-purple-300/80 text-[10px] leading-relaxed">💡 {m.stylingTip}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shopping List Panel ─── */
const PRIORITY_CONFIG = {
  essential: { label: "Essential", color: "bg-red-900/30 text-red-300 border-red-800/30", dot: "bg-red-500", icon: "🔴" },
  recommended: { label: "Recommended", color: "bg-amber-900/30 text-amber-300 border-amber-800/30", dot: "bg-amber-500", icon: "🟡" },
  optional: { label: "Optional", color: "bg-slate-700/40 text-slate-400 border-slate-600/30", dot: "bg-slate-500", icon: "⚪" },
} as const;

function ShoppingListPanel({ items }: { items: ShoppingListItem[] }) {
  const [filter, setFilter] = useState<"all" | "essential" | "recommended" | "optional">("all");
  if (!items?.length) return null;
  const essentialCount = items.filter((i) => i.priority === "essential").length;
  const filtered = filter === "all" ? items : items.filter((i) => i.priority === filter);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">🛍️ Shopping List</p>
          {essentialCount > 0 && (
            <span className="text-red-400 text-[10px] bg-red-900/20 px-2 py-0.5 rounded-full border border-red-800/30 font-medium">
              {essentialCount} essential
            </span>
          )}
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(["all", "essential", "recommended", "optional"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-[10px] font-medium capitalize transition-colors ${filter === f ? "bg-purple-600 text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((item, i) => {
          const cfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.optional;
          return (
            <div key={i} className={`rounded-2xl border p-4 space-y-2.5 ${item.priority === "essential" ? "bg-red-950/20 border-red-800/30" : item.priority === "recommended" ? "bg-amber-950/20 border-amber-800/20" : "bg-slate-800/40 border-white/5"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm leading-tight">{item.itemName}</p>
                  <p className="text-white/40 text-[10px] mt-0.5">{item.category}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex-shrink-0 ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
              </div>
              {item.preferredColor && (
                <div className="flex items-center gap-2">
                  <ColorDot color={item.preferredColor} size="sm" />
                  <span className="text-white/60 text-xs capitalize">{item.preferredColor} (matches your palette)</span>
                </div>
              )}
              {item.styleSpec && <p className="text-white/70 text-xs leading-relaxed italic">{item.styleSpec}</p>}
              <p className="text-white/50 text-xs leading-relaxed border-l-2 border-white/10 pl-2.5">{item.reason}</p>
              {item.weatherReason && (
                <div className="flex items-start gap-1.5 bg-blue-900/20 rounded-lg px-2.5 py-1.5 border border-blue-800/20">
                  <span className="text-blue-300 text-xs mt-0.5 flex-shrink-0">🌦</span>
                  <p className="text-blue-300/80 text-[10px] leading-relaxed">{item.weatherReason}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Daily Outfits Panel ─── */
function DailyOutfitsPanel({ plan }: { plan: TripPlan }) {
  if (!plan.dailyOutfits?.length) return null;
  return (
    <div className="space-y-3">
      {plan.dailyOutfits.map((day) => (
        <div key={day.day} className="bg-slate-800/60 rounded-2xl border border-white/5 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-white font-semibold text-sm">Day {day.day}: <span className="text-purple-300">{day.type}</span></p>
            <span className="text-purple-300 text-[10px] bg-purple-900/30 px-2 py-0.5 rounded-full border border-purple-700/20 flex-shrink-0">Day {day.day}</span>
          </div>
          <p className="text-white/80 text-sm leading-relaxed">{day.outfit}</p>
          {day.wardrobeItemsUsed?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {day.wardrobeItemsUsed.map((code) => (
                <span key={code} className="px-2 py-0.5 rounded-full bg-green-900/20 text-green-300 text-[10px] border border-green-800/20">✓ {code} (owned)</span>
              ))}
            </div>
          ) : null}
          {day.newItemsNeeded?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {day.newItemsNeeded.map((item, j) => (
                <span key={j} className="px-2 py-0.5 rounded-full bg-amber-900/20 text-amber-300 text-[10px] border border-amber-800/20">🛍 {item}</span>
              ))}
            </div>
          ) : null}
          {day.tip && (
            <div className="border-l-2 border-amber-500/40 pl-3">
              <p className="text-amber-300/80 text-xs">💡 {day.tip}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ─── Packing List Panel ─── */
function PackingListPanel({ plan }: { plan: TripPlan }) {
  const sections = [
    { key: "tops", label: "👕 Tops", items: plan.packingList?.tops ?? [] },
    { key: "bottoms", label: "👖 Bottoms", items: plan.packingList?.bottoms ?? [] },
    { key: "dresses", label: "👗 Dresses", items: plan.packingList?.dresses ?? [] },
    { key: "outerwear", label: "🧥 Outerwear", items: plan.packingList?.outerwear ?? [] },
    { key: "footwear", label: "👟 Footwear", items: plan.packingList?.footwear ?? [] },
    { key: "accessories", label: "👜 Accessories", items: plan.packingList?.accessories ?? [] },
    { key: "essentials", label: "🧴 Essentials", items: plan.packingList?.essentials ?? [] },
  ].filter((s) => s.items.length > 0);
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {sections.map(({ key, label, items }) => (
        <div key={key} className="bg-slate-800/60 rounded-2xl border border-white/5 p-4">
          <p className="text-white/60 text-xs font-semibold mb-3">{label}</p>
          <ul className="space-y-1.5">
            {items.map((item, i) => {
              const isOwned = item.toLowerCase().includes("from wardrobe") || !!item.toLowerCase().match(/^w\d+\s*[-–]/);
              const isNew = item.toLowerCase().includes("(new)") || item.toLowerCase().includes("(buy)") || item.toLowerCase().includes("(essential");
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-0.5 flex-shrink-0 text-xs ${isOwned ? "text-green-400" : isNew ? "text-amber-400" : "text-purple-400"}`}>
                    {isOwned ? "✓" : isNew ? "🛍" : "•"}
                  </span>
                  <span className={`text-xs leading-relaxed ${isOwned ? "text-white/70" : isNew ? "text-amber-200/80" : "text-white/80"}`}>{item}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ─── Booking Links Panel ─── */
function BookingLinksPanel({ links }: { links: BookingLinks }) {
  const sections = [
    { key: "flights", label: "✈️ Flights", items: links.flights },
    { key: "trains", label: "🚂 Trains & Buses", items: links.trains },
    { key: "hotels", label: "🏨 Hotels & Stays", items: links.hotels },
    { key: "localTransport", label: "🚗 Local Transport", items: links.localTransport },
  ] as const;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {sections.map(({ key, label, items }) => (
        <div key={key} className="bg-slate-800/60 rounded-2xl border border-white/5 p-4 space-y-2">
          <p className="text-white/60 text-xs font-semibold mb-3">{label}</p>
          {items.map((link) => (
            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-purple-600/20 border border-white/5 hover:border-purple-500/30 transition-all group">
              <span className="text-xl flex-shrink-0">{link.icon}</span>
              <div className="min-w-0">
                <p className="text-white text-xs font-medium group-hover:text-purple-300 transition-colors">{link.name}</p>
                <p className="text-white/30 text-[10px] truncate">{link.description}</p>
              </div>
              <span className="text-white/20 group-hover:text-purple-400 text-xs ml-auto flex-shrink-0 transition-colors">→</span>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── Safety Rating Stars ─── */
function SafetyStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`text-sm ${i <= rating ? "text-green-400" : "text-white/15"}`}>★</span>
      ))}
      <span className="text-white/40 text-[10px] ml-1">{rating}/5 safety</span>
    </div>
  );
}

/* ─── Budget Tier Card ─── */
function BudgetCard({ budget }: { budget: DestinationBudget }) {
  const tierConfig = {
    backpacker: { label: "🎒 Backpacker", color: "border-green-700/30 bg-green-950/20", badge: "bg-green-900/30 text-green-300 border-green-700/30" },
    average: { label: "🏨 Average Traveller", color: "border-blue-700/30 bg-blue-950/20", badge: "bg-blue-900/30 text-blue-300 border-blue-700/30" },
    luxury: { label: "✨ Luxury", color: "border-amber-700/30 bg-amber-950/20", badge: "bg-amber-900/30 text-amber-300 border-amber-700/30" },
  };
  const cfg = tierConfig[budget.tier];
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${cfg.color}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-white font-semibold text-sm">{cfg.label}</p>
          <p className="text-white/50 text-[10px] mt-0.5">per person · {budget.currency}</p>
        </div>
        <div className="text-right">
          <p className="text-white font-bold text-base">{budget.dailyCost}</p>
          <p className="text-white/40 text-[10px]">per day</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
          <p className="text-white/30 text-[9px] mb-0.5">🏨 Stay</p>
          <p className="text-white/80">{budget.accommodation}</p>
        </div>
        <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
          <p className="text-white/30 text-[9px] mb-0.5">🍽️ Food</p>
          <p className="text-white/80">{budget.food}</p>
        </div>
        <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
          <p className="text-white/30 text-[9px] mb-0.5">🚌 Transport</p>
          <p className="text-white/80">{budget.transport}</p>
        </div>
        <div className="bg-white/5 rounded-lg px-2.5 py-1.5">
          <p className="text-white/30 text-[9px] mb-0.5">🎭 Activities</p>
          <p className="text-white/80">{budget.activities}</p>
        </div>
      </div>
      {budget.totalEstimate && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${cfg.badge}`}>
          <span className="text-[10px] font-medium">Trip Total Est.</span>
          <span className="font-bold text-sm">{budget.totalEstimate}</span>
        </div>
      )}
      {budget.tips && <p className="text-white/40 text-[10px] leading-relaxed italic">{budget.tips}</p>}
    </div>
  );
}

/* ─── Discover Destination Card ─── */
function DiscoverCard({
  dest,
  onPlanThis,
}: {
  dest: DiscoverDestination;
  onPlanThis: (name: string, country: string) => void;
}) {
  const [budgetTab, setBudgetTab] = useState<"backpacker" | "average" | "luxury">("average");
  const [showAll, setShowAll] = useState(false);

  const activeBudget = dest.budgets?.find((b) => b.tier === budgetTab);
  const topAttractions = showAll ? dest.attractions : dest.attractions?.slice(0, 3);

  return (
    <div className="rounded-2xl bg-slate-800/60 border border-white/8 overflow-hidden group hover:border-purple-600/30 transition-all duration-300">
      {/* Hero image */}
      <div className="relative h-52 overflow-hidden bg-slate-900">
        {dest.imageUrl ? (
          <img
            src={dest.imageUrl}
            alt={dest.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              // Remove broken image — show gradient fallback instead
              const img = e.target as HTMLImageElement;
              img.style.display = "none";
              const parent = img.parentElement;
              if (parent && !parent.querySelector(".img-fallback")) {
                const fb = document.createElement("div");
                fb.className = "img-fallback w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 via-slate-800 to-slate-900";
                fb.innerHTML = `<span style="font-size:3rem">🌍</span>`;
                parent.appendChild(fb);
              }
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/40 via-slate-800 to-slate-900">
            <span className="text-5xl">🌍</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
        {/* Match score badge */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-purple-600/90 backdrop-blur-sm px-2.5 py-1 rounded-full border border-purple-400/30">
          <span className="text-white text-xs font-bold">{dest.matchScore}%</span>
          <span className="text-purple-200 text-[10px]">match</span>
        </div>
        {/* Location badge */}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-bold text-lg leading-tight drop-shadow-lg">{dest.name}</h3>
          <p className="text-white/70 text-xs mt-0.5">{dest.region} · {dest.country}</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Tagline */}
        <p className="text-purple-300/80 text-sm italic leading-relaxed">{dest.tagline}</p>

        {/* Match reasons */}
        {dest.matchReasons?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dest.matchReasons.map((r, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 text-[10px] border border-purple-700/20">✓ {r}</span>
            ))}
          </div>
        )}

        {/* Safety + Landscape */}
        <div className="flex items-center justify-between gap-3">
          <SafetyStars rating={dest.safetyRating ?? 3} />
          {dest.landscape && (
            <span className="text-white/40 text-[10px] capitalize">🌄 {dest.landscape}</span>
          )}
        </div>

        {/* Weather strip */}
        {dest.weather && (
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-900/20 rounded-xl px-3 py-2 text-center border border-blue-700/20">
              <p className="text-white/30 text-[9px] mb-0.5">🌡️ Temp</p>
              <p className="text-white text-xs font-medium">{dest.weather.temperature}</p>
            </div>
            <div className="bg-cyan-900/20 rounded-xl px-3 py-2 text-center border border-cyan-700/20">
              <p className="text-white/30 text-[9px] mb-0.5">💧 Humidity</p>
              <p className="text-white text-xs font-medium">{dest.weather.humidity}</p>
            </div>
            <div className="bg-amber-900/20 rounded-xl px-3 py-2 text-center border border-amber-700/20">
              <p className="text-white/30 text-[9px] mb-0.5">☀️ UV</p>
              <p className="text-white text-xs font-medium">{dest.weather.uvIndex}</p>
            </div>
          </div>
        )}

        {/* Best months */}
        {dest.weather?.bestMonths?.length > 0 && (
          <div>
            <p className="text-white/30 text-[9px] uppercase tracking-wider mb-1.5">Best time to visit</p>
            <div className="flex flex-wrap gap-1">
              {dest.weather.bestMonths.map((m, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-green-900/20 text-green-300 text-[10px] border border-green-800/20">{m}</span>
              ))}
            </div>
          </div>
        )}

        {/* Budget tabs */}
        {dest.budgets?.length > 0 && (
          <div className="space-y-3">
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              {(["backpacker", "average", "luxury"] as const).map((tier) => (
                <button key={tier} onClick={() => setBudgetTab(tier)}
                  className={`flex-1 py-1.5 text-[10px] font-semibold capitalize transition-colors ${budgetTab === tier ? "bg-purple-600 text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
                  {tier === "backpacker" ? "🎒" : tier === "average" ? "🏨" : "✨"} {tier}
                </button>
              ))}
            </div>
            {activeBudget && <BudgetCard budget={activeBudget} />}
          </div>
        )}

        {/* Attractions */}
        {dest.attractions?.length > 0 && (
          <div className="space-y-2">
            <p className="text-white/40 text-[9px] uppercase tracking-wider">Top Attractions</p>
            <div className="space-y-1.5">
              {topAttractions?.map((attr, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-white/5 rounded-xl px-3 py-2 border border-white/5">
                  <span className="text-sm flex-shrink-0 mt-0.5">{attr.mustSee ? "⭐" : "📍"}</span>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-medium leading-tight">{attr.name}</p>
                    <p className="text-white/40 text-[10px] capitalize">{attr.type}</p>
                    {attr.description && <p className="text-white/55 text-[10px] mt-0.5 leading-relaxed">{attr.description}</p>}
                  </div>
                </div>
              ))}
            </div>
            {dest.attractions.length > 3 && (
              <button onClick={() => setShowAll(!showAll)} className="text-purple-400 text-xs hover:text-purple-300 transition-colors">
                {showAll ? "Show less ↑" : `Show ${dest.attractions.length - 3} more ↓`}
              </button>
            )}
          </div>
        )}

        {/* Visa info */}
        {dest.visaInfo && (
          <div className="bg-white/5 rounded-xl px-3 py-2.5 border border-white/5 flex items-start gap-2">
            <span className="text-amber-400 text-sm flex-shrink-0">🛂</span>
            <div>
              <p className="text-white/40 text-[9px] uppercase tracking-wider mb-0.5">Visa</p>
              <p className="text-white/70 text-xs leading-relaxed">{dest.visaInfo}</p>
            </div>
          </div>
        )}

        {/* Fashion advice */}
        {dest.fashionAdvice && (
          <div className="bg-purple-900/20 rounded-xl px-3 py-2.5 border border-purple-700/20 flex items-start gap-2">
            <span className="text-purple-400 text-sm flex-shrink-0">👗</span>
            <div>
              <p className="text-purple-300/60 text-[9px] uppercase tracking-wider mb-0.5">Fashion Advice</p>
              <p className="text-white/70 text-xs leading-relaxed">{dest.fashionAdvice}</p>
            </div>
          </div>
        )}

        {/* Cultural dress codes */}
        {dest.culturalDressCodes && (
          <div className="bg-orange-900/15 rounded-xl px-3 py-2.5 border border-orange-700/20 flex items-start gap-2">
            <span className="text-orange-400 text-sm flex-shrink-0">🕌</span>
            <div>
              <p className="text-orange-300/60 text-[9px] uppercase tracking-wider mb-0.5">Cultural Dress Codes</p>
              <p className="text-white/70 text-xs leading-relaxed">{dest.culturalDressCodes}</p>
            </div>
          </div>
        )}

        {/* Sustainability */}
        {dest.sustainabilityTips && (
          <div className="bg-green-900/15 rounded-xl px-3 py-2.5 border border-green-700/20 flex items-start gap-2">
            <span className="text-green-400 text-sm flex-shrink-0">🌿</span>
            <div>
              <p className="text-green-300/60 text-[9px] uppercase tracking-wider mb-0.5">Sustainability</p>
              <p className="text-white/70 text-xs leading-relaxed">{dest.sustainabilityTips}</p>
            </div>
          </div>
        )}

        {/* Safety notes */}
        {dest.safetyNotes && (
          <p className="text-white/35 text-[10px] leading-relaxed border-l-2 border-white/10 pl-2.5">{dest.safetyNotes}</p>
        )}

        {/* Languages & Best for */}
        {(dest.languages?.length > 0 || dest.bestFor?.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {dest.languages?.map((l, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px] border border-white/5">🗣 {l}</span>)}
            {dest.bestFor?.map((b, i) => <span key={i} className="px-2 py-0.5 rounded-full bg-white/5 text-white/40 text-[10px] border border-white/5">✓ {b}</span>)}
          </div>
        )}

        {/* Plan This Trip CTA */}
        <button
          onClick={() => onPlanThis(`${dest.name}, ${dest.country}`, dest.country)}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 mt-2"
        >
          ✈️ Plan My Trip to {dest.name}
        </button>
      </div>
    </div>
  );
}

/* ─── Discover Section ─── */
function DiscoverSection({ onPlanThis }: { onPlanThis: (destination: string, country?: string) => void }) {
  const [vibe, setVibe] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [duration, setDuration] = useState("");
  const [travelers, setTravelers] = useState("");
  const [departureCity, setDepartureCity] = useState("");
  const [budgetFilter, setBudgetFilter] = useState<"all" | "backpacker" | "average" | "luxury">("all");
  const [refImageUrl, setRefImageUrl] = useState("");
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiscoverResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleInterest(val: string) {
    setInterests((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRefFile(file);
    setRefImageUrl("");
    const reader = new FileReader();
    reader.onload = (ev) => setRefPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function clearRefImage() {
    setRefFile(null);
    setRefPreview(null);
    setRefImageUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleDiscover() {
    if (!vibe.trim() && interests.length === 0 && !refFile && !refImageUrl) {
      return toast.error("Please describe your dream trip or upload a reference photo");
    }
    setLoading(true);
    setResult(null);
    try {
      let data: any;
      if (refFile) {
        // Multipart form upload
        const form = new FormData();
        form.append("image", refFile);
        if (vibe.trim()) form.append("vibe", vibe.trim());
        if (interests.length) form.append("interests", interests.join(","));
        if (duration.trim()) form.append("duration", duration.trim());
        if (travelers.trim()) form.append("travelers", travelers.trim());
        if (departureCity.trim()) form.append("departureCity", departureCity.trim());
        const r = await api.post("/api/v1/trip/discover/upload", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        data = r.data;
      } else {
        const r = await api.post("/api/v1/trip/discover", {
          vibe: vibe.trim() || undefined,
          interests: interests.length ? interests : undefined,
          duration: duration.trim() || undefined,
          travelers: travelers.trim() || undefined,
          departureCity: departureCity.trim() || undefined,
          referenceImageUrl: refImageUrl.trim() || undefined,
        });
        data = r.data;
      }
      setResult(data);
      toast.success(`Found ${data.destinations?.length ?? 0} destinations for you! 🌍`);
    } catch (e) {
      toast.error(extractErr(e));
    } finally {
      setLoading(false);
    }
  }

  const filteredDests = result?.destinations?.filter((d) =>
    budgetFilter === "all" ? true : d.budgets?.some((b) => b.tier === budgetFilter)
  ) ?? [];

  return (
    <div className="space-y-8">
      {/* Discover Form */}
      <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-white/5 p-6 space-y-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-2xl">🔭</span>
          <h2 className="text-white font-bold">Discover My Destination</h2>
          <span className="px-2.5 py-0.5 rounded-full bg-cyan-900/40 text-cyan-300 text-xs border border-cyan-700/30">AI Vision · Global</span>
        </div>

        {/* Vibe input */}
        <div>
          <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Describe your dream trip vibe</label>
          <textarea
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="e.g. I want snowy mountains, peaceful villages, colourful local markets and traditional wooden architecture — similar to Kashmir but somewhere else in the world…"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors resize-none"
          />
        </div>

        {/* Reference photo upload */}
        <div>
          <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">
            📸 Upload a reference photo <span className="text-white/25 font-normal normal-case">(optional — &quot;show me similar places to this&quot;)</span>
          </label>
          {refPreview ? (
            <div className="relative w-full max-w-sm rounded-xl overflow-hidden border border-white/10">
              <img src={refPreview} alt="Reference" className="w-full h-40 object-cover" />
              <button onClick={clearRefImage} className="absolute top-2 right-2 bg-slate-900/80 hover:bg-red-900/80 text-white text-xs px-2 py-1 rounded-lg border border-white/10 transition-colors">✕ Remove</button>
              <p className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2 text-white/70 text-[10px]">Reference: {refFile?.name}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-purple-500/50 rounded-xl p-6 text-center cursor-pointer transition-colors group"
              >
                <span className="text-3xl block mb-2 group-hover:scale-110 transition-transform">📷</span>
                <p className="text-white/50 text-sm">Drop a photo here or click to browse</p>
                <p className="text-white/25 text-xs mt-1">JPG, PNG, WEBP up to 10MB</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/25 text-[10px]">OR paste an image URL</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <input
                type="url"
                value={refImageUrl}
                onChange={(e) => setRefImageUrl(e.target.value)}
                placeholder="https://… (paste a photo URL)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Interests */}
        <div>
          <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">What are you into? <span className="text-white/25 font-normal normal-case">(select all that apply)</span></label>
          <div className="flex flex-wrap gap-2">
            {INTEREST_OPTIONS.map(({ value, label }) => (
              <button key={value} onClick={() => toggleInterest(value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${interests.includes(value) ? "bg-cyan-700 text-white border-cyan-600" : "bg-white/5 text-white/50 border-white/10 hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Trip details */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Trip Duration</label>
            <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 7 days, 2 weeks" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors" />
          </div>
          <div>
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Travellers</label>
            <input type="text" value={travelers} onChange={(e) => setTravelers(e.target.value)} placeholder="e.g. Solo, Couple, Family" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors" />
          </div>
          <div>
            <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Flying From</label>
            <input type="text" value={departureCity} onChange={(e) => setDepartureCity(e.target.value)} placeholder="e.g. Mumbai, Delhi, London" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors" />
          </div>
        </div>

        {/* Hint banner */}
        <div className="flex items-start gap-2.5 bg-cyan-900/15 rounded-xl px-4 py-3 border border-cyan-700/20">
          <span className="text-cyan-400 text-sm flex-shrink-0 mt-0.5">🔭</span>
          <p className="text-cyan-300/80 text-xs leading-relaxed">
            <strong>AI Vision Discovery</strong> — Upload any travel photo or describe your vibe. StyloGenie&apos;s vision AI analyses the landscape, climate, architecture, and mood to find similar destinations worldwide — with full budget breakdowns, weather details, visa info, and fashion advice.
          </p>
        </div>

        <button onClick={handleDiscover} disabled={loading}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {loading ? <><span className="animate-spin text-base">⟳</span> Discovering destinations…</> : "🌍 Discover My Perfect Destinations"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center py-16 gap-4">
          <div className="text-5xl animate-bounce">🔭</div>
          <p className="text-white font-semibold">Searching the world for you…</p>
          <div className="text-white/40 text-sm text-center space-y-1">
            {refFile || refImageUrl ? <p>🖼️ Analysing your reference photo with vision AI</p> : null}
            <p>🌍 Matching destinations to your vibe & interests</p>
            <p>💰 Calculating budgets for each tier</p>
            <p>🌦️ Gathering weather, visa & safety data</p>
            <p>👗 Crafting fashion advice for each destination</p>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Analysis note */}
          {result.analysisNote && (
            <div className="bg-gradient-to-r from-purple-900/30 to-cyan-900/20 rounded-2xl border border-purple-700/20 p-4 flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">🧞</span>
              <div>
                <p className="text-purple-300 text-xs font-semibold mb-1">StyloGenie&apos;s Analysis</p>
                <p className="text-white/70 text-sm leading-relaxed">{result.analysisNote}</p>
                {result.vibeKeywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {result.vibeKeywords.map((kw, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-full bg-purple-900/30 text-purple-300 text-[10px] border border-purple-700/20">#{kw}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Budget filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-white/40 text-xs font-medium">{filteredDests.length} destinations found</p>
            <div className="flex rounded-xl overflow-hidden border border-white/10 ml-auto">
              {(["all", "backpacker", "average", "luxury"] as const).map((tier) => (
                <button key={tier} onClick={() => setBudgetFilter(tier)}
                  className={`px-3 py-1.5 text-[10px] font-medium capitalize transition-colors ${budgetFilter === tier ? "bg-purple-600 text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>
                  {tier === "backpacker" ? "🎒" : tier === "average" ? "🏨" : tier === "luxury" ? "✨" : "🌍"} {tier}
                </button>
              ))}
            </div>
          </div>

          {/* Destination cards grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {filteredDests.map((dest, i) => (
              <DiscoverCard
                key={i}
                dest={dest}
                onPlanThis={(name, country) => onPlanThis(name, country)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */
export default function TripPlannerPage() {
  const [mode, setMode] = useState<"plan" | "discover">("plan");

  // Plan mode state
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bagType, setBagType] = useState("");
  const [bagSize, setBagSize] = useState("");
  const [bagNotes, setBagNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [styleProfile, setStyleProfile] = useState<UserStyleProfile | null>(null);
  const [bookingLinks, setBookingLinks] = useState<BookingLinks | null>(null);
  const [realWeather, setRealWeather] = useState<{
    temperature: string; feelsLike: string; humidity: string;
    description: string; windSpeed: string; icon: string;
    city: string; country: string; source: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<"wardrobe" | "shopping" | "packing" | "outfits" | "booking">("wardrobe");

  function handlePlanThis(dest: string, _country?: string) {
    setDestination(dest);
    setMode("plan");
    setPlan(null);
    setStyleProfile(null);
    // Default to today + 7 days if dates not set
    if (!startDate) {
      const today = new Date();
      const next = new Date(today);
      next.setDate(today.getDate() + 7);
      setStartDate(today.toISOString().split("T")[0]);
      setEndDate(next.toISOString().split("T")[0]);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success(`Ready to plan your trip to ${dest}! Confirm dates and tap Generate.`);
  }

  async function handlePlan() {
    if (!destination.trim()) return toast.error("Please enter a destination");
    setLoading(true);
    setPlan(null);
    setStyleProfile(null);
    try {
      const r = await api.post("/api/v1/trip/plan", {
        destination: destination.trim(),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        bagType: bagType || undefined,
        bagSize: bagSize || undefined,
        bagNotes: bagNotes || undefined,
        includeWardrobe: true,
        savePlan: false,
      });
      setPlan(r.data.plan);
      setStyleProfile(r.data.styleProfile);
      setBookingLinks(r.data.bookingLinks);
      setRealWeather(r.data.realWeather ?? null);
      const hasMates = (r.data.plan?.wardrobeMatches?.length ?? 0) > 0;
      setActiveTab(hasMates ? "wardrobe" : "shopping");
      toast.success("Your personalised trip plan is ready! ✈️");
    } catch (e) {
      toast.error(extractErr(e));
    } finally {
      setLoading(false);
    }
  }

  const TABS = [
    { key: "wardrobe", label: "👗 From Wardrobe", count: plan?.wardrobeMatches?.length },
    { key: "shopping", label: "🛍 Shopping List", count: plan?.shoppingList?.length, alertCount: plan?.shoppingList?.filter((i) => i.priority === "essential").length },
    { key: "packing", label: "🧳 Packing List" },
    { key: "outfits", label: "✨ Daily Outfits", count: plan?.dailyOutfits?.length },
    { key: "booking", label: "🔗 Book Trip" },
  ] as const;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">✈️ <span>AI Trip Planner</span></h1>
          <p className="text-white/40 text-sm mt-1">Discover destinations worldwide or plan your wardrobe for any trip</p>
        </div>
        <a href="/trips" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-sm transition-all flex-shrink-0">
          🌍 My Saved Trips →
        </a>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-slate-900/60 p-1 gap-1">
        <button
          onClick={() => setMode("plan")}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${mode === "plan" ? "bg-purple-600 text-white shadow-lg shadow-purple-900/40" : "text-white/50 hover:text-white"}`}
        >
          🗺️ <span>Plan My Trip</span>
          <span className="text-[10px] opacity-60">· wardrobe-aware</span>
        </button>
        <button
          onClick={() => setMode("discover")}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${mode === "discover" ? "bg-cyan-600 text-white shadow-lg shadow-cyan-900/40" : "text-white/50 hover:text-white"}`}
        >
          🌍 <span>Discover Destinations</span>
          <span className="text-[10px] opacity-60">· AI vision</span>
        </button>
      </div>

      {/* ── Discover Mode ── */}
      {mode === "discover" && <DiscoverSection onPlanThis={handlePlanThis} />}

      {/* ── Plan Mode ── */}
      {mode === "plan" && (
        <>
          <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl border border-white/5 p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🗺️</span>
              <h2 className="text-white font-bold">Let&apos;s Plan</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-900/40 text-purple-300 text-xs border border-purple-700/30">AI · Wardrobe-aware</span>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Where are you going?</label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handlePlan()}
                  placeholder="e.g. Bali, Indonesia · Paris, France · Rajasthan, India · Goa"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Departure Date <span className="text-white/25 font-normal normal-case">(optional)</span></label>
                <input
                  type="date"
                  value={startDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Return Date <span className="text-white/25 font-normal normal-case">(optional)</span></label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || new Date().toISOString().split("T")[0]}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors [color-scheme:dark]"
                />
              </div>

              <div>
                <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Bag Type</label>
                <div className="flex flex-wrap gap-2">
                  {BAG_TYPES.map((t) => (
                    <button key={t} onClick={() => setBagType(t === bagType ? "" : t)} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${bagType === t ? "bg-purple-600 text-white border-purple-500" : "bg-white/5 text-white/50 border-white/10 hover:text-white"}`}>{t}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Bag Capacity</label>
                <div className="flex flex-wrap gap-2">
                  {BAG_SIZES.map((s) => (
                    <button key={s} onClick={() => setBagSize(s === bagSize ? "" : s)} className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${bagSize === s ? "bg-cyan-700 text-white border-cyan-600" : "bg-white/5 text-white/50 border-white/10 hover:text-white"}`}>{s}</button>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="text-white/50 text-xs font-medium uppercase tracking-wider block mb-2">Trip Notes (optional)</label>
                <textarea
                  value={bagNotes}
                  onChange={(e) => setBagNotes(e.target.value)}
                  placeholder="e.g. Beach + city mix, business meetings on day 3, lots of walking, outdoor trekking, attending a wedding…"
                  rows={2}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex items-start gap-2.5 bg-purple-900/15 rounded-xl px-4 py-3 border border-purple-700/20">
              <span className="text-purple-400 text-sm flex-shrink-0 mt-0.5">🧞</span>
              <p className="text-purple-300/80 text-xs leading-relaxed">
                <strong>Wardrobe Intelligence ON</strong> — StyloGenie will scan all your classified items, build your colour & style DNA, identify what to pack from your closet, and create a personalised shopping list in your style for anything missing.
              </p>
            </div>

            <button
              onClick={handlePlan}
              disabled={loading || !destination.trim()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <><span className="animate-spin text-base">⟳</span> Analysing wardrobe &amp; planning…</> : "✈️ Generate My Personalised Trip Plan"}
            </button>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center py-16 gap-4">
              <div className="text-5xl animate-bounce">🌍</div>
              <p className="text-white font-semibold">Planning your trip to {destination}…</p>
              <div className="text-white/40 text-sm text-center space-y-1">
                <p>🔍 Researching destination weather &amp; culture</p>
                <p>👗 Scanning your wardrobe for matching items</p>
                <p>🛍️ Building your personalised shopping list</p>
                <p>✨ Applying your colour &amp; style preferences</p>
              </div>
            </div>
          )}

          {/* Results */}
          {plan && !loading && (
            <div className="space-y-6">
              {/* Destination overview */}
              <div className="bg-gradient-to-br from-purple-900/30 to-slate-800/50 rounded-2xl border border-purple-700/20 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <h2 className="text-white font-bold text-xl">{destination}</h2>
                    {plan.temperatureRange && <p className="text-purple-300 text-sm mt-0.5">🌡️ {plan.temperatureRange}</p>}
                    {plan.destinationVibe && <p className="text-white/50 text-xs mt-1 italic">{plan.destinationVibe}</p>}
                  </div>
                  {plan.styleProfile?.tripColorPalette && (
                    <div className="flex gap-1.5">
                      {plan.styleProfile.tripColorPalette.map((c, i) => <ColorDot key={i} color={c} size="md" />)}
                    </div>
                  )}
                </div>

                {/* Real-time weather from OpenWeatherMap */}
                {realWeather && (
                  <div className="flex flex-wrap items-center gap-3 bg-blue-950/40 rounded-xl px-4 py-3 border border-blue-700/20">
                    <div className="flex items-center gap-2">
                      {realWeather.icon && <img src={realWeather.icon} alt="weather" className="w-10 h-10" />}
                      <div>
                        <p className="text-white font-semibold text-sm">{realWeather.temperature}</p>
                        <p className="text-blue-300/80 text-xs">{realWeather.description}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-white/50">
                      <span>💧 {realWeather.humidity}</span>
                      <span>🌡️ Feels {realWeather.feelsLike}</span>
                      <span>💨 {realWeather.windSpeed}</span>
                    </div>
                    <span className="ml-auto text-[9px] text-blue-400/50 flex-shrink-0">Live · OpenWeatherMap</span>
                  </div>
                )}

                {plan.weatherSummary && <p className="text-white/70 text-sm leading-relaxed">{plan.weatherSummary}</p>}

                <div className="grid sm:grid-cols-2 gap-3">
                  {plan.trendInsights && (
                    <div className="bg-purple-900/20 rounded-xl px-4 py-3 border border-purple-700/20">
                      <p className="text-purple-300 text-xs font-medium mb-1">✨ Trend Insights</p>
                      <p className="text-white/70 text-sm">{plan.trendInsights}</p>
                    </div>
                  )}
                  {plan.styleNotes && (
                    <div className="bg-white/5 rounded-xl px-4 py-3 border border-white/5">
                      <p className="text-amber-300/80 text-xs font-medium mb-1">💡 Style Notes</p>
                      <p className="text-white/70 text-sm">{plan.styleNotes}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {plan.avoidItems?.map((item, i) => (
                    <span key={i} className="px-2.5 py-1 rounded-lg bg-red-900/20 text-red-300/80 text-xs border border-red-800/20">❌ {item}</span>
                  ))}
                </div>

                {plan.packingTip && (
                  <div className="bg-green-900/15 rounded-xl px-4 py-3 border border-green-700/20 flex items-start gap-2">
                    <span className="text-green-400 flex-shrink-0 text-sm">🧳</span>
                    <p className="text-white/70 text-sm">{plan.packingTip}</p>
                  </div>
                )}
              </div>

              {/* Style Profile */}
              {styleProfile && <StyleProfileCard profile={styleProfile} tripProfile={plan.styleProfile} />}

              {/* Tabs */}
              <div className="flex overflow-x-auto rounded-xl border border-white/10 w-fit max-w-full">
                {TABS.map(({ key, label, count, alertCount }: any) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2.5 text-xs sm:text-sm font-medium transition-colors flex-shrink-0 flex items-center gap-1.5 ${activeTab === key ? "bg-purple-600 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
                  >
                    {label}
                    {alertCount > 0 && (
                      <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{alertCount}</span>
                    )}
                    {!alertCount && count > 0 && (
                      <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${activeTab === key ? "bg-white/20 text-white" : "bg-white/10 text-white/50"}`}>{count}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "wardrobe" && <WardrobeMatchPanel matches={plan.wardrobeMatches ?? []} />}
              {activeTab === "shopping" && <ShoppingListPanel items={plan.shoppingList ?? []} />}
              {activeTab === "packing" && <PackingListPanel plan={plan} />}
              {activeTab === "outfits" && <DailyOutfitsPanel plan={plan} />}
              {activeTab === "booking" && bookingLinks && <BookingLinksPanel links={bookingLinks} />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
