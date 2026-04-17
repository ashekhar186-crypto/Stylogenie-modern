"use client";

import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { OutfitCalendarEntry } from "@/lib/types";

// ─── helpers ─────────────────────────────────────────────────
const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const OCCASIONS = ["Casual", "Formal", "Sports", "Party", "Ethnic"];

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayISO() {
  const n = new Date();
  return isoDate(n.getFullYear(), n.getMonth(), n.getDate());
}
function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ─── Day cell ─────────────────────────────────────────────────
function DayCell({
  day, dateStr, entry, isToday, isSelected, isPast, onClick,
}: {
  day: number; dateStr: string; entry?: OutfitCalendarEntry;
  isToday: boolean; isSelected: boolean; isPast: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative min-h-[76px] p-1.5 rounded-xl border text-left transition-all duration-150 group
        ${isSelected
          ? "border-purple-500 bg-purple-600/20 shadow-lg shadow-purple-900/30 ring-1 ring-purple-500/30"
          : entry
            ? "border-purple-700/30 bg-purple-900/10 hover:border-purple-500/40 hover:bg-purple-900/20"
            : "border-white/6 hover:border-white/20 hover:bg-white/[0.03]"}
        ${isToday ? "ring-1 ring-purple-400/50" : ""}
        ${isPast && !entry ? "opacity-40" : ""}
      `}
    >
      {/* Day number */}
      <span className={`text-xs font-semibold block mb-1 leading-none
        ${isToday ? "text-purple-300" : isSelected ? "text-white" : "text-white/45"}`}>
        {day}
      </span>

      {entry ? (
        <div className="space-y-0.5">
          {/* Item thumbnails */}
          <div className="flex gap-0.5 flex-wrap">
            {entry.items?.slice(0, 3).map((item) => (
              item.imageUrl ? (
                <img
                  key={item.id}
                  src={item.imageUrl}
                  alt=""
                  className="w-7 h-7 rounded-md object-cover border border-white/10"
                />
              ) : (
                <div key={item.id} className="w-7 h-7 rounded-md bg-purple-900/40 flex items-center justify-center text-xs border border-purple-700/20">
                  👗
                </div>
              )
            ))}
            {(entry.items?.length ?? 0) > 3 && (
              <div className="w-7 h-7 rounded-md bg-white/10 flex items-center justify-center text-[9px] text-white/50 border border-white/5">
                +{(entry.items?.length ?? 0) - 3}
              </div>
            )}
          </div>
          {entry.outfitLabel && (
            <p className="text-[9px] text-purple-300/80 truncate leading-tight mt-0.5">
              {entry.outfitLabel}
            </p>
          )}
          {entry.occasion && (
            <span className="text-[8px] text-white/30 bg-white/5 px-1 py-0.5 rounded">
              {entry.occasion}
            </span>
          )}
        </div>
      ) : (
        /* Show "+" hint on hover for future/today cells */
        !isPast && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute inset-0 flex items-center justify-center">
            <span className="text-white/20 text-xl">+</span>
          </div>
        )
      )}
    </button>
  );
}

// ─── Entry detail / edit panel ─────────────────────────────────
function EntryPanel({
  dateStr, entry, onSave, onDelete, onClose,
}: {
  dateStr: string;
  entry?: OutfitCalendarEntry;
  onSave: (data: { outfitLabel: string; occasion: string; notes: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  // key={dateStr} is applied at the call site — state resets on date change
  const [label, setLabel]     = useState(entry?.outfitLabel ?? "");
  const [occasion, setOccasion] = useState(entry?.occasion ?? "");
  const [notes, setNotes]     = useState(entry?.notes ?? "");
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync when entry changes (e.g. after save)
  useEffect(() => {
    setLabel(entry?.outfitLabel ?? "");
    setOccasion(entry?.occasion ?? "");
    setNotes(entry?.notes ?? "");
  }, [entry]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ outfitLabel: label, occasion, notes });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="bg-slate-800/95 border border-white/10 rounded-2xl p-5 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-white font-semibold text-sm">
            {entry ? "✏️ Edit Entry" : "✦ Plan Outfit"}
          </h3>
          <p className="text-white/30 text-xs mt-0.5">{formatDateLabel(dateStr)}</p>
        </div>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors text-xl leading-none flex-shrink-0">×</button>
      </div>

      {/* Item previews (if entry from Outfit Studio) */}
      {entry?.items && entry.items.length > 0 && (
        <div>
          <p className="text-white/35 text-[10px] uppercase tracking-wider mb-2">Outfit Items</p>
          <div className="flex gap-2 flex-wrap">
            {entry.items.map((item) => (
              <div key={item.id} className="relative group/img">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.title ?? ""}
                    className="w-14 h-16 object-cover rounded-xl border border-white/10"
                  />
                ) : (
                  <div className="w-14 h-16 rounded-xl border border-white/10 bg-purple-900/30 flex items-center justify-center text-lg">
                    👗
                  </div>
                )}
                {item.dominantColorHex && (
                  <div
                    className="absolute bottom-1 right-1 w-2.5 h-2.5 rounded-full border border-white/20"
                    style={{ background: item.dominantColorHex }}
                  />
                )}
                {item.title && (
                  <div className="absolute inset-0 flex items-end justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <p className="text-[8px] text-white bg-black/70 w-full text-center rounded-b-xl px-1 py-0.5 truncate">
                      {item.title}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state: nudge to Outfit Studio */}
      {(!entry?.items || entry.items.length === 0) && (
        <div className="bg-purple-900/15 border border-purple-700/20 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
          <span className="text-purple-400 text-sm flex-shrink-0 mt-0.5">💡</span>
          <p className="text-purple-300/70 text-xs leading-relaxed">
            Go to <a href="/recommend" className="text-purple-300 underline underline-offset-2 hover:text-purple-200">Outfit Studio</a> to generate a look, then tap 📅 to save it here with items.
          </p>
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-2.5">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Outfit label (e.g. Office Monday Look)"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/60 transition-colors"
        />
        <select
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500/60 transition-colors appearance-none"
        >
          <option value="">Occasion (optional)</option>
          {OCCASIONS.map((o) => (
            <option key={o} value={o} className="bg-slate-800">{o}</option>
          ))}
        </select>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes — mood, weather, styling tips…"
          rows={2}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500/60 resize-none transition-colors"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? (
            <><span className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin" /> Saving…</>
          ) : (
            entry ? "Update Entry" : "Save to Calendar"
          )}
        </button>
        {entry && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2.5 rounded-xl bg-rose-900/30 hover:bg-rose-900/60 text-rose-300 text-sm transition-all border border-rose-700/30 disabled:opacity-50"
          >
            {deleting ? "…" : "Remove"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Week row header ──────────────────────────────────────────
function WeekRow({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}

// ─── Main Page ─────────────────────────────────────────────────
export default function CalendarPage() {
  const today = new Date();
  const [year, setYear]         = useState(today.getFullYear());
  const [month, setMonth]       = useState(today.getMonth());
  const [entries, setEntries]   = useState<Record<string, OutfitCalendarEntry>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const todayStr = todayISO();

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/api/v1/calendar?month=${monthKey}`);
      if (r.data._migrationNeeded) {
        setMigrationNeeded(true);
        setEntries({});
        return;
      }
      setMigrationNeeded(false);
      const map: Record<string, OutfitCalendarEntry> = {};
      (r.data.entries as OutfitCalendarEntry[]).forEach((e) => { map[e.date] = e; });
      setEntries(map);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setSelectedDate(todayStr);
  }

  async function handleSave(data: { outfitLabel: string; occasion: string; notes: string }) {
    if (!selectedDate) return;
    try {
      const existing = entries[selectedDate];
      await api.post("/api/v1/calendar", {
        date: selectedDate,
        outfitLabel: data.outfitLabel || undefined,
        occasion: data.occasion || undefined,
        notes: data.notes || undefined,
        itemIds: existing?.itemIds ?? [],
        outfitType: existing?.outfitType,
      });
      toast.success("Saved to calendar ✦");
      await fetchEntries();
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "Failed to save entry";
      if (msg.includes("migration")) {
        toast.error("Calendar feature needs a DB migration. Run: cd backend && npx prisma migrate dev");
      } else {
        toast.error(msg);
      }
    }
  }

  async function handleDelete() {
    if (!selectedDate) return;
    try {
      await api.delete(`/api/v1/calendar/${selectedDate}`);
      toast.success("Removed from calendar");
      setSelectedDate(null);
      await fetchEntries();
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? "Failed to remove entry");
    }
  }

  // Build calendar grid
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const plannedDays   = Object.keys(entries).length;
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="bg-gradient-to-br from-teal-500 to-cyan-700 rounded-xl w-8 h-8 flex items-center justify-center text-base shadow-lg">📅</span>
            Outfit Calendar
          </h1>
          <p className="text-white/40 text-sm mt-0.5 ml-10">Plan your daily looks — tap a date to log your outfit</p>
        </div>
        <div className="flex items-center gap-2">
          {!isCurrentMonth && (
            <button
              onClick={goToToday}
              className="px-3 py-1.5 rounded-xl border border-white/10 text-white/50 hover:text-white hover:bg-white/5 text-xs transition-all"
            >
              Today
            </button>
          )}
          <div className="text-right">
            <div className="text-white text-lg font-bold">{plannedDays}</div>
            <div className="text-white/30 text-xs">planned this month</div>
          </div>
        </div>
      </div>

      {/* Migration notice */}
      {migrationNeeded && (
        <div className="bg-amber-900/20 border border-amber-600/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-amber-400 text-lg flex-shrink-0">⚠️</span>
          <div>
            <p className="text-amber-300 font-semibold text-sm">Calendar needs a database migration</p>
            <p className="text-amber-200/60 text-xs mt-1 leading-relaxed">
              Run this in your terminal to enable the calendar feature:
            </p>
            <code className="text-amber-200/80 text-xs bg-black/30 rounded px-2 py-1 mt-1.5 inline-block font-mono">
              cd backend && npx prisma migrate dev --name v3_features
            </code>
          </div>
        </div>
      )}

      <div className={`grid ${selectedDate ? "md:grid-cols-[1fr_290px]" : "grid-cols-1"} gap-4 items-start`}>

        {/* ── Calendar grid ── */}
        <div>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3 bg-white/[0.02] rounded-xl px-3 py-2 border border-white/6">
            <button
              onClick={prevMonth}
              className="text-white/40 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-all text-lg leading-none"
            >‹</button>
            <h2 className="text-white font-semibold text-base">{MONTHS[month]} {year}</h2>
            <button
              onClick={nextMonth}
              className="text-white/40 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition-all text-lg leading-none"
            >›</button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1.5">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-white/25 text-[10px] font-semibold uppercase tracking-wider py-1">{d}</div>
            ))}
          </div>

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-[76px] rounded-xl bg-white/[0.02] animate-pulse border border-white/4" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, idx) => {
                if (day === null) return <div key={`empty-${idx}`} className="min-h-[76px]" />;
                const dateStr = isoDate(year, month, day);
                const entry   = entries[dateStr];
                const isPast  = dateStr < todayStr;
                return (
                  <DayCell
                    key={dateStr}
                    day={day}
                    dateStr={dateStr}
                    entry={entry}
                    isToday={dateStr === todayStr}
                    isSelected={selectedDate === dateStr}
                    isPast={isPast}
                    onClick={() => setSelectedDate((prev) => (prev === dateStr ? null : dateStr))}
                  />
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-purple-900/50 border border-purple-700/40" />
              <span className="text-white/25 text-[10px]">Planned outfit</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm border border-purple-400/50 ring-1 ring-purple-400/30" />
              <span className="text-white/25 text-[10px]">Today</span>
            </div>
          </div>
        </div>

        {/* ── Entry panel ── */}
        {selectedDate && (
          <div className="md:sticky md:top-4">
            {/* key={selectedDate} ensures EntryPanel state resets when date changes */}
            <EntryPanel
              key={selectedDate}
              dateStr={selectedDate}
              entry={entries[selectedDate]}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => setSelectedDate(null)}
            />

            {/* Quick tip */}
            <p className="text-white/20 text-[10px] mt-3 text-center leading-relaxed">
              💡 Save an outfit from <a href="/recommend" className="text-purple-400/60 hover:text-purple-300 underline underline-offset-2">Outfit Studio</a> with the 📅 button to auto-fill this calendar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
