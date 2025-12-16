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

  // try refresh once on mount to obtain tokens/session
  useEffect(() => {
    let done = false;
    (async () => {
      try {
        await api.post("/api/v1/auth/refresh");
        // optionally fetch /me if you add it; for now, decode minimal user from a small ping
        // quick hack: call an endpoint that returns user; if not available, keep null
        // we'll keep null and let login/register fill it after success.
      } catch {
        // ignore
      } finally {
        if (!done) setLoading(false);
      }
    })();
    return () => {
      done = true;
    };
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
