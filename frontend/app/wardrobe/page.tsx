"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Item, Section, Season, Occasion } from "@/lib/types";
import Link from "next/link";

const SECTIONS: (Section | "All")[] = ["All","Tops","Bottoms","Dresses","Outerwear","Footwear","Accessories","Ethnicwear","Sportswear"];
const SEASONS:  (Season  | "All")[] = ["All","Spring","Summer","Autumn","Winter"];
const OCCASIONS:(Occasion| "All")[] = ["All","Casual","Formal","Sports","Party","Ethnic"];

const SECTION_ICONS: Record<string, string> = {
  All:"✦", Tops:"👕", Bottoms:"👖", Dresses:"👗", Outerwear:"🧥",
  Footwear:"👟", Accessories:"👜", Ethnicwear:"🥻", Sportswear:"🏃",
};

/* ── Item Detail Modal ──────────────────────────────────────────────────────── */
function ItemModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const qc = useQueryClient();
  const archiveMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/items/${item.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["items"] }); toast.success("Item removed"); onClose(); },
    onError: () => toast.error("Failed to remove item"),
  });
  const laundryMut = useMutation({
    mutationFn: () => api.put(`/api/v1/items/${item.id}/laundry`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["items"] }); toast.success(item.inLaundry ? "Removed from laundry 🧺" : "Added to laundry 🧺"); },
    onError: () => toast.error("Failed to update laundry status"),
  });
  const wearMut = useMutation({
    mutationFn: () => api.post(`/api/v1/items/${item.id}/wear`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["items"] }); toast.success(`Wear #${(item.wearCount ?? 0) + 1} logged! ✦`); },
    onError: () => toast.error("Failed to log wear"),
  });

  const cpw = item.price && item.wearCount > 0 ? (Number(item.price) / item.wearCount).toFixed(0) : null;

  const attrs = [
    { label: "Material",   value: item.material },
    { label: "Texture",    value: item.texture },
    { label: "Pattern",    value: item.pattern },
    { label: "Fit",        value: item.fit },
    { label: "Silhouette", value: item.silhouette },
    { label: "Style Era",  value: item.styleEra },
    { label: "Season",     value: item.season },
    { label: "Occasion",   value: item.occasion },
    { label: "Care",       value: item.careGuess },
    { label: "Size",       value: item.size },
  ].filter(a => a.value);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 760,
          background: "linear-gradient(145deg,rgba(18,10,40,0.98),rgba(8,5,20,0.99))",
          border: "1px solid rgba(139,92,246,0.2)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 24,
          boxShadow: "0 2px 0 rgba(255,255,255,0.07) inset, 0 40px 100px rgba(0,0,0,0.8), 0 0 80px rgba(139,92,246,0.1)",
          overflow: "hidden", maxHeight: "90vh", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", flex: 1, overflow: "hidden" }}>
          {/* Image side */}
          <div style={{
            position: "relative", minHeight: 320,
            background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.title ?? "Item"}
                style={{ width: "100%", height: "100%", objectFit: "cover", minHeight: 320 }}
              />
            ) : (
              <div style={{ fontSize: 64, opacity: 0.15 }}>👗</div>
            )}
            {/* Color swatch */}
            {item.dominantColorHex && (
              <div style={{
                position: "absolute", top: 14, right: 14,
                width: 22, height: 22, borderRadius: "50%",
                background: item.dominantColorHex,
                border: "2px solid rgba(255,255,255,0.3)",
                boxShadow: `0 2px 10px ${item.dominantColorHex}80`,
              }} />
            )}
          </div>

          {/* Info side */}
          <div style={{ padding: 24, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800, lineHeight: 1.2, margin: 0 }}>
                {item.title || "Untitled Item"}
              </h2>
              {item.brand && <p style={{ color: "#c084fc", fontSize: 12, fontWeight: 600, marginTop: 4 }}>{item.brand}</p>}
              {item.section && (
                <span style={{
                  display: "inline-block", marginTop: 8,
                  padding: "3px 12px", borderRadius: 99,
                  background: "rgba(139,92,246,0.15)", color: "#c4b5fd",
                  border: "1px solid rgba(139,92,246,0.3)", fontSize: 11, fontWeight: 700,
                }}>{item.section}</span>
              )}
            </div>

            {item.deepSummary && (
              <p style={{
                color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.6,
                fontStyle: "italic",
                borderLeft: "2px solid rgba(139,92,246,0.4)",
                paddingLeft: 12, margin: 0,
              }}>&ldquo;{item.deepSummary}&rdquo;</p>
            )}

            {attrs.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {attrs.map(({ label, value }) => (
                  <div key={label} style={{
                    background: "rgba(255,255,255,0.04)", borderRadius: 10,
                    padding: "8px 10px",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}>
                    <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 3 }}>{label}</p>
                    <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 600, textTransform: "capitalize", margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            {item.color?.length > 0 && (
              <div>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>Colors</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {item.color.map(c => (
                    <span key={c} style={{
                      padding: "4px 12px", borderRadius: 99,
                      background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)",
                      border: "1px solid rgba(255,255,255,0.12)", fontSize: 11, textTransform: "capitalize",
                    }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {item.styleTags?.length > 0 && (
              <div>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>Style Tags</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {item.styleTags.map(tag => (
                    <span key={tag} style={{
                      padding: "4px 10px", borderRadius: 8,
                      background: "rgba(139,92,246,0.12)", color: "#c4b5fd",
                      border: "1px solid rgba(139,92,246,0.25)", fontSize: 11, fontWeight: 600,
                    }}>#{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Wear tracking + cost per wear */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{
                flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 12,
                background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.18)",
                textAlign: "center",
              }}>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>Wears</p>
                <p style={{ color: "#c4b5fd", fontSize: 20, fontWeight: 800, margin: 0 }}>{item.wearCount ?? 0}</p>
              </div>
              {cpw && (
                <div style={{
                  flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 12,
                  background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)",
                  textAlign: "center",
                }}>
                  <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>Cost/Wear</p>
                  <p style={{ color: "#86efac", fontSize: 18, fontWeight: 800, margin: 0 }}>₹{cpw}</p>
                </div>
              )}
              {item.price && (
                <div style={{
                  flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 12,
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  textAlign: "center",
                }}>
                  <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>Price</p>
                  <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 16, fontWeight: 700, margin: 0 }}>₹{Number(item.price).toLocaleString("en-IN")}</p>
                </div>
              )}
              {item.inLaundry && (
                <div style={{
                  flex: 1, minWidth: 80, padding: "10px 12px", borderRadius: 12,
                  background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)",
                  textAlign: "center",
                }}>
                  <p style={{ color: "#93c5fd", fontSize: 13, fontWeight: 700, margin: 0 }}>🧺 Laundry</p>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto", paddingTop: 8 }}>
              <button
                onClick={() => wearMut.mutate()}
                disabled={wearMut.isPending}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 12,
                  border: "1px solid rgba(139,92,246,0.3)",
                  background: "rgba(139,92,246,0.15)", color: "#c4b5fd",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  transition: "all 0.2s", minWidth: 90,
                } as React.CSSProperties}
              >+1 Wear ✦</button>
              <button
                onClick={() => laundryMut.mutate()}
                disabled={laundryMut.isPending}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 12,
                  border: item.inLaundry ? "1px solid rgba(59,130,246,0.4)" : "1px solid rgba(255,255,255,0.12)",
                  background: item.inLaundry ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.05)",
                  color: item.inLaundry ? "#93c5fd" : "rgba(255,255,255,0.5)",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", minWidth: 90,
                } as React.CSSProperties}
              >{item.inLaundry ? "✓ Laundry" : "🧺 Laundry"}</button>
              <button
                onClick={() => archiveMut.mutate()}
                disabled={archiveMut.isPending}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 12,
                  border: "1px solid rgba(239,68,68,0.25)",
                  background: "rgba(239,68,68,0.1)", color: "#f87171",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s", minWidth: 80,
                } as React.CSSProperties}
              >Remove</button>
            </div>
            <button
              onClick={onClose}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              } as React.CSSProperties}
            >Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Item Card ──────────────────────────────────────────────────────────────── */
function ItemCard({ item, index, onClick }: { item: Item; index: number; onClick: () => void }) {
  const hasImage = !!item.imageUrl;
  return (
    <div
      onClick={onClick}
      style={{
        breakInside: "avoid", marginBottom: 14, cursor: "pointer",
        borderRadius: 20, overflow: "hidden",
        background: "linear-gradient(145deg,rgba(22,14,50,0.9),rgba(12,8,28,0.95))",
        border: "1px solid rgba(255,255,255,0.07)",
        borderTop: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 2px 0 rgba(255,255,255,0.05) inset, 0 12px 40px rgba(0,0,0,0.5)",
        transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(-4px) scale(1.01)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 0 rgba(255,255,255,0.08) inset, 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(139,92,246,0.2), 0 8px 32px rgba(139,92,246,0.15)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.3)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = "translateY(0) scale(1)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 0 rgba(255,255,255,0.05) inset, 0 12px 40px rgba(0,0,0,0.5)";
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.07)";
      }}
    >
      {/* Image zone */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {hasImage ? (
          <>
            <img
              src={item.imageUrl}
              alt={item.title ?? "item"}
              loading="lazy"
              style={{ width: "100%", display: "block", transition: "transform 0.5s ease" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
            />
            {/* Hover overlay gradient */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(to top,rgba(0,0,0,0.75) 0%,transparent 50%)",
              pointerEvents: "none",
            }} />
            {/* View details */}
            <div style={{
              position: "absolute", bottom: 10, left: 0, right: 0,
              display: "flex", justifyContent: "center",
              opacity: 0, transition: "opacity 0.2s",
            }} className="card-view-hint">
              <span style={{
                background: "rgba(139,92,246,0.8)", color: "#fff",
                fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 99,
                backdropFilter: "blur(8px)",
              }}>View Details →</span>
            </div>
          </>
        ) : (
          /* Placeholder */
          <div style={{
            height: 160,
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            background: "linear-gradient(135deg,rgba(139,92,246,0.05),rgba(236,72,153,0.03))",
          }}>
            <div style={{ fontSize: 32, opacity: 0.12 }}>👗</div>
            <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 9, letterSpacing: "0.08em" }}>NO IMAGE · RE-CLASSIFY TO ADD</span>
          </div>
        )}

        {/* Number badge */}
        <div style={{
          position: "absolute", top: 10, left: 10,
          width: 24, height: 24, borderRadius: "50%",
          background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.9)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>{index}</div>

        {/* Color dot */}
        {item.dominantColorHex && (
          <div style={{
            position: "absolute", top: 10, right: 10,
            width: 14, height: 14, borderRadius: "50%",
            background: item.dominantColorHex,
            border: "1.5px solid rgba(255,255,255,0.3)",
            boxShadow: `0 2px 6px ${item.dominantColorHex}80`,
          }} />
        )}

        {/* Laundry badge */}
        {item.inLaundry && (
          <div style={{
            position: "absolute", bottom: 10, right: 10,
            background: "rgba(59,130,246,0.85)", backdropFilter: "blur(8px)",
            borderRadius: 99, padding: "2px 8px",
            fontSize: 9, fontWeight: 700, color: "#fff",
            border: "1px solid rgba(147,197,253,0.3)",
          }}>🧺 Laundry</div>
        )}

        {/* Wear count badge */}
        {item.wearCount > 0 && (
          <div style={{
            position: "absolute", bottom: item.inLaundry ? 30 : 10, right: 10,
            background: "rgba(139,92,246,0.75)", backdropFilter: "blur(8px)",
            borderRadius: 99, padding: "2px 7px",
            fontSize: 9, fontWeight: 700, color: "#fff",
          }}>{item.wearCount}×</div>
        )}
      </div>

      {/* Card footer */}
      <div style={{ padding: "12px 14px 14px" }}>
        <p style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.title || "Untitled"}
        </p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 5 }}>
          {item.section && (
            <span style={{
              padding: "2px 9px", borderRadius: 99, fontSize: 10, fontWeight: 700,
              background: "rgba(139,92,246,0.14)", color: "#c4b5fd",
              border: "1px solid rgba(139,92,246,0.25)",
            }}>{item.section}</span>
          )}
          {item.styleEra && (
            <span style={{
              padding: "2px 9px", borderRadius: 99, fontSize: 10,
              background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.38)",
            }}>{item.styleEra}</span>
          )}
        </div>
        {item.material && (
          <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, margin: 0, textTransform: "capitalize" }}>
            {item.material}{item.texture ? ` · ${item.texture}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Filter pill ────────────────────────────────────────────────────────────── */
function Pill({ label, active, onClick, accent }: { label: string; active: boolean; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px", borderRadius: 99, border: "none",
        fontSize: 12, fontWeight: active ? 700 : 500,
        cursor: "pointer", transition: "all 0.18s",
        background: active
          ? (accent ?? "linear-gradient(135deg,#7c3aed,#a855f7)")
          : "rgba(255,255,255,0.05)",
        color: active ? "#fff" : "rgba(255,255,255,0.45)",
        outline: "none",
        boxShadow: active
          ? `0 4px 16px rgba(139,92,246,0.35), inset 0 0 0 1px transparent`
          : `inset 0 0 0 1px rgba(255,255,255,0.08)`,
      }}
    >{label}</button>
  );
}

/* ── Masonry Grid — flex-column approach (no break-inside bugs) ─────────────── */
function MasonryGrid({ items, onSelect }: { items: Item[]; onSelect: (item: Item) => void }) {
  const [cols, setCols] = useState(4);

  useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if      (w < 560)  setCols(2);
      else if (w < 860)  setCols(3);
      else if (w < 1100) setCols(4);
      else if (w < 1400) setCols(5);
      else               setCols(6);
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Distribute items round-robin across columns
  const columns: Item[][] = Array.from({ length: cols }, () => []);
  items.forEach((item, i) => columns[i % cols].push(item));

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {col.map((item) => {
            const globalIndex = items.indexOf(item) + 1;
            return (
              <ItemCard
                key={item.id}
                item={item}
                index={globalIndex}
                onClick={() => onSelect(item)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function WardrobePage() {
  const [section,    setSection]    = useState<Section | "All">("All");
  const [season,     setSeason]     = useState<Season  | "All">("All");
  const [occasion,   setOccasion]   = useState<Occasion| "All">("All");
  const [search,     setSearch]     = useState("");
  const [selected,   setSelected]   = useState<Item | null>(null);
  const [laundryOnly, setLaundryOnly] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["items"],
    queryFn: async () => { const r = await api.get("/api/v1/items"); return r.data?.items as Item[]; },
  });

  const items = (data ?? []).filter(it => {
    if (section  !== "All" && it.section  !== section)  return false;
    if (season   !== "All" && it.season   !== season)   return false;
    if (occasion !== "All" && it.occasion !== occasion) return false;
    if (laundryOnly && !it.inLaundry) return false;
    if (search) {
      const q = search.toLowerCase();
      return it.title?.toLowerCase().includes(q)
        || it.material?.toLowerCase().includes(q)
        || it.styleEra?.toLowerCase().includes(q)
        || it.styleTags?.some(t => t.toLowerCase().includes(q))
        || it.color?.some(c => c.toLowerCase().includes(q));
    }
    return true;
  });
  const laundryCount = (data ?? []).filter(it => it.inLaundry).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{
            fontSize: 28, fontWeight: 800, letterSpacing: "-0.025em", margin: 0,
            background: "linear-gradient(135deg,#e2d9f3 0%,#c084fc 45%,#f472b6 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Digital Wardrobe</h1>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 4 }}>
            {isLoading ? "Loading…" : `${data?.length ?? 0} items in your closet${items.length !== data?.length ? `, ${items.length} shown` : ""}`}
          </p>
        </div>
        <Link href="/describe" style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 20px", borderRadius: 12, textDecoration: "none",
          background: "linear-gradient(135deg,#6d28d9,#a855f7)",
          color: "#fff", fontSize: 13, fontWeight: 700,
          boxShadow: "0 4px 20px rgba(139,92,246,0.45), 0 1px 0 rgba(255,255,255,0.2) inset",
          transition: "box-shadow 0.2s",
        }}>🔮 Add via AI</Link>
      </div>

      {/* ── Search ── */}
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.25)", fontSize: 15 }}>🔍</span>
        <input
          type="text"
          placeholder="Search by title, material, style, color…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "rgba(0,0,0,0.3)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 14, padding: "12px 16px 12px 44px",
            color: "#fff", fontSize: 13, outline: "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4) inset",
            transition: "border-color 0.2s",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(139,92,246,0.45)"; }}
          onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.09)"; }}
        />
      </div>

      {/* ── Filters ── */}
      <div style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        {/* Category */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SECTIONS.map(s => (
            <Pill
              key={s}
              label={`${SECTION_ICONS[s] ?? ""} ${s}`}
              active={section === s}
              onClick={() => setSection(s)}
            />
          ))}
        </div>
        {/* Season + Occasion */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
          {SEASONS.map(s => (
            <Pill key={s} label={s} active={season === s} onClick={() => setSeason(s)} accent="linear-gradient(135deg,#0891b2,#06b6d4)" />
          ))}
          <span style={{ color: "rgba(255,255,255,0.15)", alignSelf: "center", fontSize: 12 }}>·</span>
          {OCCASIONS.map(o => (
            <Pill key={o} label={o} active={occasion === o} onClick={() => setOccasion(o)} accent="linear-gradient(135deg,#b45309,#d97706)" />
          ))}
          {laundryCount > 0 && (
            <>
              <span style={{ color: "rgba(255,255,255,0.15)", alignSelf: "center", fontSize: 12 }}>·</span>
              <Pill
                label={`🧺 In Laundry (${laundryCount})`}
                active={laundryOnly}
                onClick={() => setLaundryOnly(!laundryOnly)}
                accent="linear-gradient(135deg,#1d4ed8,#3b82f6)"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Loading ── */}
      {isLoading && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 12, opacity: 0.5 }}>
          <div style={{ fontSize: 48, animation: "pulse 1.5s ease-in-out infinite" }}>👗</div>
          <p style={{ color: "#fff", fontSize: 14 }}>Loading your wardrobe…</p>
        </div>
      )}

      {/* ── Error ── */}
      {isError && <div style={{ textAlign: "center", padding: "40px 0", color: "#f87171", fontSize: 14 }}>Failed to load wardrobe</div>}

      {/* ── Empty state ── */}
      {!isLoading && !isError && items.length === 0 && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
          padding: "80px 32px",
          background: "linear-gradient(145deg,rgba(20,10,45,0.6),rgba(10,6,25,0.7))",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 24,
          boxShadow: "0 2px 0 rgba(255,255,255,0.04) inset",
        }}>
          <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.2 }}>🧺</div>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {data?.length === 0 ? "Your wardrobe is empty" : "No items match these filters"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 13, marginBottom: 20 }}>
            {data?.length === 0 ? "Classify your first garment to get started" : "Try adjusting the filters above"}
          </p>
          {data?.length === 0 && (
            <Link href="/describe" style={{
              padding: "10px 24px", borderRadius: 12, textDecoration: "none",
              background: "linear-gradient(135deg,#6d28d9,#a855f7)",
              color: "#fff", fontSize: 13, fontWeight: 700,
              boxShadow: "0 4px 20px rgba(139,92,246,0.4)",
            }}>🔮 Classify first item</Link>
          )}
        </div>
      )}

      {/* ── Masonry grid — flex-column approach (reliable, no break-inside bugs) ── */}
      {!isLoading && items.length > 0 && (
        <MasonryGrid items={items} onSelect={setSelected} />
      )}

      {selected && <ItemModal item={selected} onClose={() => setSelected(null)} />}

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(0.9)} }
      `}</style>
    </div>
  );
}
