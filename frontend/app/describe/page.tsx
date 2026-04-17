"use client";

import * as React from "react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import axios from "axios";
import { api } from "@/lib/api";
import type { DeepClassification } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";

function extractErr(e: unknown): string {
  if (axios.isAxiosError(e)) return e.response?.data?.error ?? e.message;
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

/* ── Attribute badge ──────────────────────────────────────────────────────── */
const ATTR_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  garmentType:{ bg: "rgba(250,204,21,0.12)", text: "#fde68a", border: "rgba(250,204,21,0.25)", label: "Garment Type" },
  subType:    { bg: "rgba(34,197,94,0.12)",  text: "#86efac", border: "rgba(34,197,94,0.25)",  label: "Sub-Type"    },
  material:   { bg: "rgba(59,130,246,0.12)",  text: "#93c5fd", border: "rgba(59,130,246,0.25)",  label: "Material"   },
  texture:    { bg: "rgba(6,182,212,0.12)",   text: "#67e8f9", border: "rgba(6,182,212,0.25)",   label: "Texture"    },
  pattern:    { bg: "rgba(139,92,246,0.12)",  text: "#c4b5fd", border: "rgba(139,92,246,0.25)",  label: "Pattern"    },
  fit:        { bg: "rgba(236,72,153,0.12)",  text: "#f9a8d4", border: "rgba(236,72,153,0.25)",  label: "Fit"        },
  silhouette: { bg: "rgba(244,63,94,0.12)",   text: "#fda4af", border: "rgba(244,63,94,0.25)",   label: "Silhouette" },
  styleEra:   { bg: "rgba(245,158,11,0.12)",  text: "#fcd34d", border: "rgba(245,158,11,0.25)",  label: "Style Era"  },
  season:     { bg: "rgba(16,185,129,0.12)",  text: "#6ee7b7", border: "rgba(16,185,129,0.25)",  label: "Season"     },
  occasion:   { bg: "rgba(249,115,22,0.12)",  text: "#fdba74", border: "rgba(249,115,22,0.25)",  label: "Occasion"   },
  care:       { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "rgba(100,116,139,0.25)", label: "Care"       },
};

function AttrBadge({ type, value }: { type: string; value: string }) {
  const s = ATTR_STYLE[type] ?? { bg: "rgba(255,255,255,0.06)", text: "rgba(255,255,255,0.65)", border: "rgba(255,255,255,0.12)", label: type };
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12 }}
         className="flex flex-col px-3 py-2 min-w-0">
      <span style={{ color: "rgba(255,255,255,0.38)", fontSize: 9, letterSpacing: "0.14em" }} className="uppercase font-semibold mb-0.5">{s.label}</span>
      <span style={{ color: s.text, fontSize: 12 }} className="font-semibold capitalize truncate">{value}</span>
    </div>
  );
}

function ModelPill({ model }: { model: string }) {
  const isClip   = model.includes("clip");
  const isGemini = model.includes("gemini");
  const label = isClip ? "Local CLIP" : isGemini ? "Gemini Flash" : model.split("/").pop()?.split(":")[0] ?? model;
  const icon  = isClip ? "⚡" : isGemini ? "✦" : "🤖";
  return (
    <span style={{
      background: isClip ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)",
      border: `1px solid ${isClip ? "rgba(16,185,129,0.3)" : "rgba(99,102,241,0.3)"}`,
      color: isClip ? "#6ee7b7" : "#a5b4fc",
      fontSize: 10, borderRadius: 99, padding: "2px 10px", fontWeight: 600,
    }}>
      {icon} {label}
    </span>
  );
}

function ImageTypePill({ imageType }: { imageType: string }) {
  const MAP: Record<string, { icon: string; label: string; color: string; bg: string; border: string }> = {
    "person-wearing": { icon: "🧍", label: "Person Wearing", color: "#a5f3fc", bg: "rgba(6,182,212,0.14)",   border: "rgba(6,182,212,0.3)"   },
    "mannequin":      { icon: "🗿", label: "Mannequin",      color: "#d9f99d", bg: "rgba(132,204,22,0.14)",  border: "rgba(132,204,22,0.3)"  },
    "flat-lay":       { icon: "📄", label: "Flat Lay",       color: "#fde68a", bg: "rgba(245,158,11,0.14)",  border: "rgba(245,158,11,0.3)"  },
    "product-photo":  { icon: "🛍️", label: "Product Photo",  color: "#fca5a5", bg: "rgba(239,68,68,0.14)",   border: "rgba(239,68,68,0.3)"   },
  };
  const s = MAP[imageType] ?? { icon: "📸", label: imageType, color: "rgba(255,255,255,0.6)", bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.15)" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: 99, padding: "3px 11px", fontSize: 11, fontWeight: 600,
    }}>
      {s.icon} {s.label}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function DescribePage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"url" | "upload">("upload");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploadedImageUrl, setUploadedImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DeepClassification | null>(null);
  const [usedModel, setUsedModel] = useState("");
  const [savedToWardrobe, setSavedToWardrobe] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function applyFile(f: File) {
    setFile(f);
    setResult(null);
    setSavedToWardrobe(false);
    setUploadedImageUrl("");
    setPreview(URL.createObjectURL(f));
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f) applyFile(f);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) applyFile(f);
    else toast.error("Please drop an image file");
  }, []);

  function resetMode(m: "url" | "upload") {
    setMode(m);
    setResult(null);
    setSavedToWardrobe(false);
    setUploadedImageUrl("");
    if (m === "url") { setFile(null); setPreview(""); }
  }

  async function handleDescribe() {
    setLoading(true);
    setResult(null);
    setSavedToWardrobe(false);
    setUploadedImageUrl("");
    try {
      let r: any;
      if (mode === "url") {
        if (!imageUrl.trim()) { toast.error("Please enter an image URL"); return; }
        r = await api.post("/api/v1/describe", { imageUrl, saveItem: false });
      } else {
        if (!file) { toast.error("Please choose an image"); return; }
        const form = new FormData();
        form.append("image", file);
        form.append("saveItem", "false");
        r = await api.post("/api/v1/describe/upload", form);
        if (r.data?.uploadedImageUrl) setUploadedImageUrl(r.data.uploadedImageUrl);
      }
      setResult(r.data?.classification ?? null);
      setUsedModel(r.data?.model ?? "");
      toast.success("Deep classification complete!");
    } catch (e) {
      toast.error(extractErr(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    setLoading(true);
    try {
      const imageUrlToSave = mode === "url" ? imageUrl : uploadedImageUrl;
      await api.post("/api/v1/describe/save", { imageUrl: imageUrlToSave, classification: result });
      qc.invalidateQueries({ queryKey: ["items"] });
      setSavedToWardrobe(true);
      toast.success("Saved to your wardrobe!");
    } catch (e) {
      toast.error(extractErr(e));
    } finally {
      setLoading(false);
    }
  }

  const imgSrc = preview || imageUrl;
  const canAnalyze = mode === "url" ? !!imageUrl.trim() : !!file;

  return (
    <div style={{ minHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em",
            background: "linear-gradient(135deg,#e2d9f3 0%,#c084fc 45%,#f472b6 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Deep Classifier
          </h1>
          <p style={{ color: "rgba(255,255,255,0.32)", fontSize: 13, marginTop: 2 }}>
            AI garment analysis — material, fit, pattern, style era &amp; trend intelligence
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: "flex", background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)", borderRadius: 12, overflow: "hidden",
        }}>
          {(["upload", "url"] as const).map((m) => (
            <button key={m} onClick={() => resetMode(m)} style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: mode === m ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "transparent",
              color: mode === m ? "#fff" : "rgba(255,255,255,0.4)",
              border: "none", transition: "all 0.18s",
              boxShadow: mode === m ? "0 2px 12px rgba(139,92,246,0.45)" : "none",
            }}>
              {m === "upload" ? "📸 Upload" : "🔗 URL"}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main split layout ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, flex: 1, minHeight: 0 }}
           className="lg:grid-cols-2 grid-cols-1">

        {/* ════ LEFT: Image panel ════ */}
        <div style={{
          background: "linear-gradient(145deg,rgba(20,10,45,0.85) 0%,rgba(10,6,25,0.95) 100%)",
          border: "1px solid rgba(139,92,246,0.14)",
          borderTop: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 24,
          boxShadow: "0 2px 0 rgba(255,255,255,0.05) inset, 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.3)",
          display: "flex", flexDirection: "column",
          overflow: "hidden", position: "relative",
          minHeight: 520,
        }}>

          {/* Ambient glow behind image */}
          {imgSrc && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 0,
              background: "radial-gradient(ellipse 70% 60% at 50% 40%,rgba(139,92,246,0.12) 0%,transparent 70%)",
              pointerEvents: "none",
            }} />
          )}

          {/* Image display */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1, padding: imgSrc ? 0 : 32 }}>
            {imgSrc ? (
              <div style={{ width: "100%", height: "100%", position: "relative" }}>
                <img
                  src={imgSrc}
                  alt="Fashion item preview"
                  style={{
                    width: "100%", height: "100%",
                    objectFit: "contain",
                    display: "block",
                    maxHeight: 420,
                  }}
                />
                {/* Overlay label if analyzed */}
                {result && (
                  <div style={{
                    position: "absolute", top: 12, left: 12,
                    background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, padding: "5px 12px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    {result.dominantColorHex && (
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: result.dominantColorHex, flexShrink: 0 }} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontWeight: 600, textTransform: "capitalize" }}>
                        {result.garmentType ?? result.category}
                      </span>
                      {result.imageType && (
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}>
                          {result.imageType.replace("-", " ")}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Drop zone */
              <label
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  width: "100%", cursor: "pointer", padding: "48px 24px",
                  borderRadius: 16,
                  border: `2px dashed ${dragOver ? "rgba(139,92,246,0.7)" : "rgba(255,255,255,0.1)"}`,
                  background: dragOver ? "rgba(139,92,246,0.07)" : "transparent",
                  transition: "all 0.2s",
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <div style={{ fontSize: 52, marginBottom: 16, opacity: 0.5 }}>{dragOver ? "🎯" : "📸"}</div>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
                  {dragOver ? "Drop your image here" : "Drop image or click to browse"}
                </p>
                <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 12 }}>PNG, JPG, WEBP — max 8 MB</p>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              </label>
            )}

            {/* Click-to-replace overlay when image is showing */}
            {imgSrc && mode === "upload" && (
              <label style={{
                position: "absolute", bottom: 12, right: 12, cursor: "pointer",
                background: "rgba(0,0,0,0.7)", backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
                padding: "5px 12px", color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600,
              }}>
                🔄 Change
                <input type="file" accept="image/*" className="hidden" onChange={onFileChange} />
              </label>
            )}
          </div>

          {/* URL input (shown only in url mode) */}
          {mode === "url" && (
            <div style={{ padding: "0 20px 20px" }}>
              <input
                type="url"
                placeholder="https://example.com/clothing-image.jpg"
                value={imageUrl}
                onChange={(e) => { setImageUrl(e.target.value); setResult(null); setSavedToWardrobe(false); }}
                style={{
                  width: "100%", background: "rgba(0,0,0,0.4)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12, padding: "11px 16px",
                  color: "#fff", fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4) inset",
                }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(139,92,246,0.5)"; }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
            </div>
          )}

          {/* Analyze button */}
          <div style={{ padding: "0 20px 20px" }}>
            <button
              onClick={handleDescribe}
              disabled={loading || !canAnalyze}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
                cursor: loading || !canAnalyze ? "not-allowed" : "pointer",
                background: loading || !canAnalyze
                  ? "rgba(255,255,255,0.06)"
                  : "linear-gradient(135deg,#6d28d9 0%,#a855f7 55%,#ec4899 100%)",
                color: loading || !canAnalyze ? "rgba(255,255,255,0.3)" : "#fff",
                fontSize: 15, fontWeight: 700, letterSpacing: "0.01em",
                boxShadow: !loading && canAnalyze
                  ? "0 6px 28px rgba(139,92,246,0.55), 0 1px 0 rgba(255,255,255,0.2) inset"
                  : "none",
                transition: "all 0.2s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {loading ? (
                <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span> Analyzing…</>
              ) : (
                "🔮 Deep Classify"
              )}
            </button>
          </div>
        </div>

        {/* ════ RIGHT: Results panel ════ */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 14,
          overflowY: "auto", maxHeight: "calc(100vh - 200px)",
          paddingRight: 4,
        }}>

          {/* Empty state */}
          {!result && !loading && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", textAlign: "center",
              background: "linear-gradient(145deg,rgba(20,10,45,0.7),rgba(10,6,25,0.8))",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 24, padding: "60px 32px",
              boxShadow: "0 2px 0 rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.5)",
              minHeight: 400,
            }}>
              <div style={{ fontSize: 64, marginBottom: 20, opacity: 0.25 }}>🧵</div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
                Classification results appear here
              </p>
              <p style={{ color: "rgba(255,255,255,0.18)", fontSize: 13 }}>
                Upload or paste a garment image to get started
              </p>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div style={{
              flex: 1, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", textAlign: "center",
              background: "linear-gradient(145deg,rgba(20,10,45,0.7),rgba(10,6,25,0.8))",
              border: "1px solid rgba(139,92,246,0.15)",
              borderRadius: 24, padding: "60px 32px",
              boxShadow: "0 2px 0 rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.5)",
              minHeight: 400,
            }}>
              <div style={{ fontSize: 56, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }}>🔮</div>
              <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Analyzing garment…</p>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Examining material, pattern, fit, style era…</p>
              <div style={{ display: "flex", gap: 6, marginTop: 20 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "rgba(139,92,246,0.7)",
                    animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Results ── */}
          {result && !loading && (
            <>
              {/* Hero card: title + category + color swatch */}
              <div style={{
                background: "linear-gradient(145deg,rgba(109,40,217,0.18) 0%,rgba(168,85,247,0.08) 50%,rgba(236,72,153,0.06) 100%)",
                border: "1px solid rgba(139,92,246,0.22)",
                borderTop: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 20,
                padding: "22px 22px 18px",
                boxShadow: "0 2px 0 rgba(255,255,255,0.06) inset, 0 20px 50px rgba(0,0,0,0.4)",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{
                      fontSize: 20, fontWeight: 800, color: "#fff",
                      letterSpacing: "-0.02em", lineHeight: 1.2, margin: 0,
                    }}>{result.title}</h2>
                    <p style={{ color: "#c084fc", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", marginTop: 5 }}>
                      {result.category}
                    </p>
                    {result.garmentType && (
                      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600, marginTop: 3, textTransform: "capitalize" }}>
                        {result.garmentType}
                      </p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, alignItems: "center" }}>
                      {result.imageType && <ImageTypePill imageType={result.imageType} />}
                      {result.subType && (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          background: "rgba(34,197,94,0.12)", color: "#86efac",
                          border: "1px solid rgba(34,197,94,0.28)",
                          borderRadius: 99, padding: "3px 11px", fontSize: 11, fontWeight: 600,
                        }}>
                          🏷️ {result.subType}
                        </span>
                      )}
                    </div>
                    {usedModel && <div style={{ marginTop: 8 }}><ModelPill model={usedModel} /></div>}
                  </div>
                  {result.dominantColorHex && (
                    <div style={{
                      width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                      background: result.dominantColorHex,
                      border: "2px solid rgba(255,255,255,0.18)",
                      boxShadow: `0 4px 20px ${result.dominantColorHex}66`,
                    }} title={result.dominantColorHex} />
                  )}
                </div>
                {result.summary && (
                  <p style={{
                    color: "rgba(255,255,255,0.55)", fontSize: 13, lineHeight: 1.6,
                    marginTop: 12, fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 12,
                  }}>
                    &ldquo;{result.summary}&rdquo;
                  </p>
                )}
              </div>

              {/* Colors row */}
              {result.colors?.length > 0 && (
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 16, padding: "14px 18px",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)",
                }}>
                  <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
                    Colors Detected
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {result.colors.map((c) => (
                      <span key={c} style={{
                        padding: "5px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600,
                        background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.8)",
                        border: "1px solid rgba(255,255,255,0.12)", textTransform: "capitalize",
                      }}>{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Full classification grid */}
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 16, padding: "14px 18px",
                boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)",
              }}>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
                  Full Classification
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 8 }}>
                  {result.garmentType && <AttrBadge type="garmentType" value={result.garmentType} />}
                  {result.subType     && <AttrBadge type="subType"     value={result.subType} />}
                  {result.material    && <AttrBadge type="material"   value={result.material} />}
                  {result.texture     && <AttrBadge type="texture"    value={result.texture} />}
                  {result.pattern     && <AttrBadge type="pattern"    value={result.pattern} />}
                  {result.fit         && <AttrBadge type="fit"        value={result.fit} />}
                  {result.silhouette  && <AttrBadge type="silhouette" value={result.silhouette} />}
                  {result.styleEra    && <AttrBadge type="styleEra"   value={result.styleEra} />}
                  {result.season      && <AttrBadge type="season"     value={result.season} />}
                  {result.occasion    && <AttrBadge type="occasion"   value={result.occasion} />}
                  {result.careGuess   && <AttrBadge type="care"       value={result.careGuess} />}
                </div>
              </div>

              {/* Trend tags */}
              {result.trendTags?.length > 0 && (
                <div style={{
                  background: "rgba(139,92,246,0.05)",
                  border: "1px solid rgba(139,92,246,0.15)",
                  borderRadius: 16, padding: "14px 18px",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.3)",
                }}>
                  <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 10 }}>
                    Trend Intelligence
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {result.trendTags.map((tag) => (
                      <span key={tag} style={{
                        padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: "rgba(168,85,247,0.15)", color: "#c4b5fd",
                        border: "1px solid rgba(168,85,247,0.28)",
                      }}>#{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Save CTA */}
              {!savedToWardrobe ? (
                <button
                  onClick={handleSave}
                  disabled={loading}
                  style={{
                    width: "100%", padding: "15px 0", borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.12)",
                    cursor: loading ? "not-allowed" : "pointer",
                    background: "linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))",
                    color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 700,
                    boxShadow: "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px rgba(0,0,0,0.3)",
                    transition: "all 0.2s",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  } as React.CSSProperties}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg,rgba(139,92,246,0.22),rgba(236,72,153,0.12))";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.4)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 0 rgba(255,255,255,0.1) inset, 0 8px 32px rgba(139,92,246,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 0 rgba(255,255,255,0.08) inset, 0 8px 24px rgba(0,0,0,0.3)";
                  }}
                >
                  👗 Save to Wardrobe
                </button>
              ) : (
                <div style={{
                  padding: "15px 0", borderRadius: 14, textAlign: "center",
                  background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)",
                  color: "#6ee7b7", fontSize: 14, fontWeight: 700,
                  boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset",
                }}>
                  ✓ Saved to your wardrobe!
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(0.92); } }
      `}</style>
    </div>
  );
}
