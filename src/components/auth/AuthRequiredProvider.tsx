"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import LoginModal from "./LoginModal";

export type ApiErrorShape = { error?: string; message?: string };

type Ctx = {
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  apiFetchJson: <T = unknown>(
    input: RequestInfo | URL,
    init?: RequestInit
  ) => Promise<{ res: Response; data: T | ApiErrorShape | null }>;
  withAuth: <R>(fn: () => Promise<R>) => Promise<R | null>;
  openLogin: (msg?: string) => void;
};

const AuthCtx = createContext<Ctx | null>(null);

export default function AuthRequiredProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | undefined>(undefined);

  const openLogin = useCallback((m?: string) => {
    setMsg(m);
    setOpen(true);
  }, []);

  const apiFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const nextInit: RequestInit = {
      ...init,
      credentials: init?.credentials ?? "include",
    };
    const res = await fetch(input, nextInit);
    if (res.status === 401) openLogin();
    return res;
  }, [openLogin]);

  const apiFetchJson = useCallback(async <T,>(input: RequestInfo | URL, init?: RequestInit) => {
    const res = await apiFetch(input, init);
    let data: T | ApiErrorShape | null = null;
    try { data = await res.json(); } catch { /* no body */ }
    return { res, data };
  }, [apiFetch]);

  const withAuth = useCallback(async <R,>(fn: () => Promise<R>) => {
    try {
      return await fn();
    } catch (error: unknown) {
      if (typeof error === "object" && error !== null) {
        const status = "status" in error && typeof (error as { status?: unknown }).status === "number"
          ? (error as { status: number }).status
          : undefined;
        const code = "code" in error && typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : undefined;
        if (status === 401 || code === "UNAUTHORIZED") {
          openLogin();
        }
      }
      return null;
    }
  }, [openLogin]);

  const value = useMemo<Ctx>(() => ({ apiFetch, apiFetchJson, withAuth, openLogin }), [apiFetch, apiFetchJson, withAuth, openLogin]);

  return (
    <AuthCtx.Provider value={value}>
      {children}
      <LoginModal open={open} onClose={() => setOpen(false)} message={msg} />
    </AuthCtx.Provider>
  );
}

export function useAuthRequired() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuthRequired must be used within AuthRequiredProvider");
  return ctx;
}
