"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/providers/auth";
import { useTheme } from "@/app/providers/theme";
import { cn } from "@/lib/utils";
import OnboardingModal from "@/components/onboarding/OnboardingModal";

const NAV_ITEMS = [
  { href: "/describe",      icon: "🔮", label: "Describer",     sublabel: "Deep AI Classifier",  color: "violet" },
  { href: "/wardrobe",      icon: "👗", label: "Wardrobe",      sublabel: "Digital Closet",       color: "pink"   },
  { href: "/style-chat",   icon: "✦",  label: "Style Chat",    sublabel: "Trend AI",             color: "purple" },
  { href: "/recommend",    icon: "🪄", label: "Outfit Studio",  sublabel: "AI Recommendations",   color: "indigo" },
  { href: "/trip-planner", icon: "✈️", label: "Trip Planner",  sublabel: "AI Travel Stylist",    color: "sky"    },
  { href: "/calendar",     icon: "📅", label: "Calendar",      sublabel: "Outfit Planner",        color: "teal"   },
  { href: "/stats",        icon: "📊", label: "Stats",         sublabel: "Wardrobe Analytics",    color: "green"  },
  { href: "/trips",        icon: "🌍", label: "My Trips",      sublabel: "Saved Plans",           color: "amber"  },
  { href: "/gaps",         icon: "🔍", label: "Gap Analysis",  sublabel: "What's Missing",        color: "rose"   },
  { href: "/style-report", icon: "📋", label: "Style Report",  sublabel: "Download PDF",           color: "cyan"   },
];

const ACTIVE_GRADIENT_EXTRA: Record<string, string> = {
  teal:  "from-teal-600/20   to-cyan-600/10   border-teal-500/25   text-teal-200",
  green: "from-green-600/20  to-emerald-600/10 border-green-500/25  text-green-200",
  amber: "from-amber-600/20  to-orange-600/10 border-amber-500/25  text-amber-200",
  rose:  "from-rose-600/20   to-pink-600/10   border-rose-500/25   text-rose-200",
  cyan:  "from-cyan-600/20   to-sky-600/10    border-cyan-500/25   text-cyan-200",
};

const ACTIVE_GRADIENT: Record<string, string> = {
  violet: "from-violet-600/20 to-purple-600/10 border-violet-500/25 text-violet-200",
  pink:   "from-pink-600/20   to-rose-600/10   border-pink-500/25   text-pink-200",
  purple: "from-purple-600/20 to-indigo-600/10 border-purple-500/25 text-purple-200",
  indigo: "from-indigo-600/20 to-blue-600/10   border-indigo-500/25 text-indigo-200",
  sky:    "from-sky-600/20    to-cyan-600/10   border-sky-500/25    text-sky-200",
};

const ACTIVE_DOT: Record<string, string> = {
  violet: "#a78bfa", pink: "#f472b6", purple: "#c084fc", indigo: "#818cf8", sky: "#38bdf8",
  teal: "#2dd4bf", green: "#4ade80", amber: "#fbbf24", rose: "#fb7185", cyan: "#22d3ee",
};

function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="p-1.5 rounded-lg transition-all hover:scale-110"
      style={{
        color: isDark ? "rgba(255,255,255,0.22)" : "rgba(60,30,90,0.35)",
        background: "transparent",
      }}
    >
      {isDark ? (
        /* Sun icon */
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2" x2="12" y2="4"/>
          <line x1="12" y1="20" x2="12" y2="22"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="2" y1="12" x2="4" y2="12"/>
          <line x1="20" y1="12" x2="22" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        /* Moon icon */
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { isDark } = useTheme();
  const pathname = usePathname();
  const router   = useRouter();

  const isAuth = pathname.startsWith("/login") || pathname.startsWith("/register");

  useEffect(() => {
    if (!loading && !user && !isAuth) router.replace("/login");
  }, [user, loading, isAuth, router]);

  /* ── Auth pages ─────────────────────────────────────────────── */
  if (isAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
           style={{ background: "linear-gradient(135deg,#060412 0%,#0f0720 50%,#120824 100%)" }}>
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full blur-[160px] opacity-20"
             style={{ background: "radial-gradient(circle,#7c3aed,transparent)" }} />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full blur-[130px] opacity-15"
             style={{ background: "radial-gradient(circle,#ec4899,transparent)" }} />
        <div className="relative z-10 w-full">{children}</div>
      </div>
    );
  }

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading || (!user && !isAuth)) {
    return (
      <div className="min-h-screen flex items-center justify-center"
           style={{ background: "linear-gradient(135deg,#060412,#0f0720)" }}>
        <div className="flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl float"
               style={{
                 background: "linear-gradient(135deg,#7c3aed,#a855f7,#ec4899)",
                 boxShadow: "0 8px 32px rgba(139,92,246,0.5), 0 1px 0 rgba(255,255,255,0.2) inset",
               }}>
            🧞
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p className="text-white/70 text-sm font-medium">Loading StyloGenie</p>
            <div className="flex gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-400 opacity-60"
                     style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleLogout = async () => { await logout(); router.replace("/login"); };

  return (
    <div className="flex min-h-screen" style={{ background: isDark ? "rgb(6,4,18)" : "rgb(242,238,255)" }}>

      {/* ════════════════ SIDEBAR ════════════════ */}
      <aside className="sg-sidebar hidden md:flex w-64 flex-col fixed h-full z-20"
             style={{
               background: isDark
                 ? "linear-gradient(180deg,rgba(14,8,32,0.99) 0%,rgba(8,5,20,0.99) 100%)"
                 : "linear-gradient(180deg,rgba(248,244,255,0.99) 0%,rgba(242,238,255,0.99) 100%)",
               borderRight: isDark ? "1px solid rgba(139,92,246,0.10)" : "1px solid rgba(124,58,237,0.10)",
               boxShadow: isDark
                 ? "4px 0 48px rgba(0,0,0,0.6), inset -1px 0 0 rgba(139,92,246,0.06)"
                 : "4px 0 24px rgba(124,58,237,0.07)",
             }}>

        {/* ── Brand ── */}
        <div className="px-5 pt-6 pb-5" style={{ borderBottom: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(124,58,237,0.08)" }}>
          <Link href="/describe" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-all duration-300 group-hover:scale-105 group-hover:rotate-3"
                 style={{
                   background: "linear-gradient(135deg,#6d28d9,#a855f7,#ec4899)",
                   boxShadow: "0 4px 20px rgba(139,92,246,0.55), 0 1px 0 rgba(255,255,255,0.25) inset",
                 }}>
              🧞
            </div>
            <div>
              <p className="font-bold text-white text-sm tracking-wide leading-none">StyloGenie</p>
              <p className="text-[9px] font-bold tracking-[0.22em] uppercase mt-1"
                 style={{ background: "linear-gradient(90deg,#a78bfa,#f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                AI Fashion System
              </p>
            </div>
          </Link>
        </div>

        {/* ── Nav items ── */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 group",
                      active
                        ? `bg-gradient-to-r ${ACTIVE_GRADIENT[item.color] ?? ACTIVE_GRADIENT_EXTRA[item.color] ?? ACTIVE_GRADIENT["purple"]}`
                        : isDark
                          ? "border-transparent text-white/40 hover:text-white/80 hover:bg-white/[0.04] hover:border-white/[0.06]"
                          : "border-transparent text-[rgba(60,30,90,0.45)] hover:text-[rgba(60,30,90,0.85)] hover:bg-[rgba(124,58,237,0.05)] hover:border-[rgba(124,58,237,0.08)]"
                    )}>

                {/* Icon box */}
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0 transition-all duration-200",
                  active ? "scale-100" : "opacity-60 group-hover:opacity-90 group-hover:scale-105"
                )}
                     style={active ? {
                       background: "rgba(255,255,255,0.08)",
                       boxShadow: "0 2px 10px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.12) inset",
                     } : {}}>
                  {item.icon}
                </div>

                {/* Labels */}
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    "text-sm font-semibold leading-none transition-colors",
                    active ? "" : isDark ? "text-white/55 group-hover:text-white/85" : "text-[rgba(60,30,90,0.52)] group-hover:text-[rgba(30,15,60,0.85)]"
                  )}>{item.label}</p>
                  <p className={cn("text-[10px] mt-0.5 transition-colors", isDark ? "text-white/22 group-hover:text-white/32" : "text-[rgba(60,30,90,0.30)] group-hover:text-[rgba(60,30,90,0.45)]")}>{item.sublabel}</p>
                </div>

                {/* Active indicator dot */}
                {active && (
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                       style={{ background: ACTIVE_DOT[item.color], boxShadow: `0 0 6px ${ACTIVE_DOT[item.color]}` }} />
                )}
              </Link>
            );
          })}

          {/* Admin */}
          {user!.role === "ADMIN" && (
            <>
              <div className="pt-5 pb-1.5 px-2">
                <p className="section-label">Admin</p>
              </div>
              <Link href="/admin"
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all duration-200 group",
                      pathname === "/admin"
                        ? "bg-gradient-to-r from-amber-600/20 to-orange-600/10 border-amber-500/25 text-amber-200"
                        : "border-transparent text-white/40 hover:text-white/80 hover:bg-white/[0.04] hover:border-white/[0.06]"
                    )}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0">⚙️</div>
                <div>
                  <p className="text-sm font-semibold">Admin Panel</p>
                  <p className="text-[10px] text-white/25">Users & Moderation</p>
                </div>
              </Link>
            </>
          )}
        </nav>

        {/* ── User card ── */}
        <div className="px-3 pb-4 pt-3" style={{ borderTop: isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(124,58,237,0.08)" }}>
          <div className="sg-user-card rounded-xl px-3 py-3 flex items-center gap-3"
               style={{
                 background: isDark ? "rgba(255,255,255,0.03)" : "rgba(124,58,237,0.05)",
                 border: isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(124,58,237,0.10)",
                 boxShadow: isDark ? "0 2px 12px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.04) inset" : "0 2px 10px rgba(124,58,237,0.07)",
               }}>
            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                 style={{
                   background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                   boxShadow: "0 2px 10px rgba(139,92,246,0.45)",
                 }}>
              {user!.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate leading-none" style={{ color: isDark ? "rgba(255,255,255,0.9)" : "rgb(30,15,60)" }}>{user!.name}</p>
              <p className="text-[10px] truncate mt-0.5" style={{ color: isDark ? "rgba(255,255,255,0.28)" : "rgba(60,30,90,0.42)" }}>{user!.email}</p>
            </div>
            {/* Theme toggle */}
            <ThemeToggle />
            {/* Logout icon */}
            <button onClick={handleLogout} title="Sign out"
                    className="p-1.5 rounded-lg transition-all hover:text-red-400 hover:bg-red-500/10"
                    style={{ color: isDark ? "rgba(255,255,255,0.20)" : "rgba(60,30,90,0.28)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16,17 21,12 16,7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ════════════════ MOBILE TOP BAR ════════════════ */}
      <div className="sg-mobile-topbar md:hidden fixed top-0 left-0 right-0 z-30 px-4 py-3 flex items-center justify-between"
           style={{
             background: isDark ? "rgba(6,4,18,0.92)" : "rgba(248,244,255,0.96)",
             backdropFilter: "blur(24px)",
             borderBottom: isDark ? "1px solid rgba(139,92,246,0.10)" : "1px solid rgba(124,58,237,0.10)",
             boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 2px 16px rgba(124,58,237,0.08)",
           }}>
        <Link href="/describe" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
               style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", boxShadow: "0 2px 10px rgba(139,92,246,0.45)" }}>
            🧞
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-none">StyloGenie</p>
            <p className="text-[8px] font-semibold tracking-widest uppercase"
               style={{ background: "linear-gradient(90deg,#a78bfa,#f472b6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              AI Fashion
            </p>
          </div>
        </Link>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm"
             style={{ background: "linear-gradient(135deg,#7c3aed,#a855f7)", boxShadow: "0 2px 8px rgba(139,92,246,0.4)" }}>
          {user!.name.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* ════════════════ MOBILE BOTTOM NAV ════════════════ */}
      {/* Scrollable horizontal nav — supports any number of items */}
      <div className="sg-mobile-bottomnav md:hidden fixed bottom-0 left-0 right-0 z-30"
           style={{
             background: isDark ? "rgba(6,4,18,0.96)" : "rgba(248,244,255,0.98)",
             backdropFilter: "blur(24px)",
             borderTop: isDark ? "1px solid rgba(139,92,246,0.10)" : "1px solid rgba(124,58,237,0.10)",
             boxShadow: isDark ? "0 -4px 24px rgba(0,0,0,0.6)" : "0 -2px 16px rgba(124,58,237,0.07)",
           }}>
        <div className="flex overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}
                    className="flex-shrink-0 flex flex-col items-center py-2.5 px-2.5 gap-0.5 relative transition-all min-w-[58px]">
                {/* Active top bar */}
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                       style={{ background: "linear-gradient(90deg,#a78bfa,#f472b6)" }} />
                )}
                <span className={cn("text-xl transition-all duration-200", active ? "scale-110" : "opacity-35 scale-95")}>
                  {item.icon}
                </span>
                <span className={cn("text-[8px] font-semibold tracking-wide transition-colors", active ? "text-purple-300" : "text-white/25")}>
                  {item.label.split(" ")[0]}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ════════════════ MAIN CONTENT ════════════════ */}
      <main className="sg-main flex-1 md:ml-64 min-h-screen relative">
        {/* Ambient glow */}
        <div className="fixed inset-0 pointer-events-none"
             style={{
               background: `
                 radial-gradient(ellipse 60% 50% at 20% 10%, rgba(139,92,246,0.07) 0%, transparent 60%),
                 radial-gradient(ellipse 40% 35% at 85% 85%, rgba(236,72,153,0.05) 0%, transparent 55%)
               `,
               zIndex: 0,
             }} />

        <div className="relative" style={{ zIndex: 1 }}>
          <div className="md:hidden h-14" />
          <div className="px-5 md:px-10 py-6 md:py-8 pb-24 md:pb-10 page-enter">
            {children}
          </div>
          <div className="md:hidden h-16" />
        </div>
      </main>

      {/* Feature 18: Onboarding for first-time users */}
      <OnboardingModal />
    </div>
  );
}
