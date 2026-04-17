'use client';

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

type Session = { user: User | null; loading: boolean };
type Ctx = Session & {
  setUser: (u: User | null) => void;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: refresh tokens, then fetch /me to restore session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.post("/api/v1/auth/refresh");
        // After refresh, fetch the current user
        const { data } = await api.get("/api/v1/auth/me");
        if (!cancelled && data?.user) setUser(data.user);
      } catch {
        // Not authenticated — user stays null
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const logout = async () => {
    await api.post("/api/v1/auth/logout");
    setUser(null);
  };

  const value = useMemo<Ctx>(() => ({ user, loading, setUser, logout }), [user, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
