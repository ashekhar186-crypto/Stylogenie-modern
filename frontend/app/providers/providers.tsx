"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const [dark, setDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <QueryClientProvider client={client}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-10 border-b border-black/10 dark:border-white/10 bg-background/70 backdrop-blur px-6 py-3 flex items-center justify-between">
          <div className="font-semibold">StyloGenie</div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="opacity-80 hover:opacity-100 transition">Home</Link>
            <Link href="/login" className="opacity-80 hover:opacity-100 transition">Login</Link>
            <Link href="/register" className="opacity-80 hover:opacity-100 transition">Register</Link>
            <Link href="/dashboard" className="opacity-80 hover:opacity-100 transition">Dashboard</Link>
          </nav>

          <button
            onClick={() => setDark((d) => !d)}
            className="rounded-lg border px-3 py-1.5 text-sm border-black/15 dark:border-white/20 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Toggle dark mode"
          >
            {dark ? "Light" : "Dark"}
          </button>
        </header>

        <main className="p-6">{children}</main>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}
