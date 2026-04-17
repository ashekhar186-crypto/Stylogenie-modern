"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "sg_onboarded_v1";

const STEPS = [
  {
    icon: "🔮",
    title: "Classify Your Clothes",
    subtitle: "AI-powered wardrobe scanner",
    description: "Upload a photo of any garment. GENIE will identify fabric, style era, micro-trend, and fit — and save it to your digital closet.",
    cta: "Start with Describer",
    href: "/describe",
    color: "from-violet-600 to-purple-800",
  },
  {
    icon: "👗",
    title: "Your Digital Wardrobe",
    subtitle: "Every piece, organized",
    description: "Browse your entire closet by category, season, or occasion. Log wears, track cost-per-wear, and see what's in the laundry.",
    cta: "View Wardrobe",
    href: "/wardrobe",
    color: "from-pink-600 to-rose-800",
  },
  {
    icon: "🪄",
    title: "AI Outfit Studio",
    subtitle: "Dress smarter every day",
    description: "GENIE scores outfit combinations from your wardrobe by color harmony, occasion fit, and 2025 trend alignment. Like the ones you love.",
    cta: "Generate Outfits",
    href: "/recommend",
    color: "from-indigo-600 to-blue-800",
  },
  {
    icon: "✦",
    title: "Chat with GENIE",
    subtitle: "Your personal fashion AI",
    description: "Ask GENIE anything about fashion, trends, or what to wear. GENIE knows your wardrobe and gives you hyper-personalized advice.",
    cta: "Start Chatting",
    href: "/style-chat",
    color: "from-purple-600 to-fuchsia-800",
  },
  {
    icon: "✈️",
    title: "AI Trip Planner",
    subtitle: "Pack perfectly, every time",
    description: "Tell GENIE where you're going. It builds a full packing list, daily outfits, and destination style guide — using your actual wardrobe.",
    cta: "Plan a Trip",
    href: "/trip-planner",
    color: "from-sky-600 to-cyan-800",
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Show only if not seen before
    if (typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY)) {
      // Small delay to avoid flashing on first paint
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    setExiting(true);
    setTimeout(() => {
      setVisible(false);
      if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
    }, 300);
  }

  function next() {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else dismiss();
  }

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-300 ${
        exiting ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(20px)" }}
    >
      <div
        className="w-full max-w-md relative"
        style={{
          background: "linear-gradient(145deg,rgba(18,10,40,0.99),rgba(8,5,20,0.99))",
          border: "1px solid rgba(139,92,246,0.2)",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 28,
          boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 80px rgba(139,92,246,0.12), 0 2px 0 rgba(255,255,255,0.07) inset",
          overflow: "hidden",
        }}
      >
        {/* Glow banner */}
        <div className={`h-1.5 bg-gradient-to-r ${current.color} opacity-80`} />

        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-white/20 hover:text-white/50 transition-colors text-xs px-2 py-1 rounded"
        >
          Skip intro
        </button>

        <div className="p-8 text-center space-y-5">
          {/* Icon */}
          <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-4xl bg-gradient-to-br ${current.color} shadow-2xl shadow-purple-900/50`}>
            {current.icon}
          </div>

          {/* Title */}
          <div>
            <p className="text-xs text-white/30 uppercase tracking-[0.2em] mb-1">{current.subtitle}</p>
            <h2 className="text-2xl font-bold text-white">{current.title}</h2>
          </div>

          {/* Description */}
          <p className="text-white/55 text-sm leading-relaxed">{current.description}</p>

          {/* Step dots */}
          <div className="flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all cursor-pointer ${
                  i === step ? "w-6 h-1.5 bg-purple-400" : "w-1.5 h-1.5 bg-white/15 hover:bg-white/30"
                }`}
              />
            ))}
          </div>

          {/* CTAs */}
          <div className="flex gap-2 pt-2">
            <Link
              href={current.href}
              onClick={dismiss}
              className={`flex-1 py-3 rounded-2xl bg-gradient-to-r ${current.color} text-white text-sm font-bold text-center transition-all hover:opacity-90 shadow-lg`}
            >
              {current.cta} →
            </Link>
            <button
              onClick={next}
              className="px-5 py-3 rounded-2xl border border-white/10 text-white/40 hover:text-white/70 hover:bg-white/5 text-sm transition-all"
            >
              {step < STEPS.length - 1 ? "Next" : "Get started"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
