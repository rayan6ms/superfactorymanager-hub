"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ShieldAlert, X } from "lucide-react";

function isExternalLink(href: string, currentOrigin: string) {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;
  try {
    const url = new URL(href, currentOrigin);
    return url.origin !== currentOrigin;
  } catch {
    return false;
  }
}

type PendingNavigation = {
  href: string;
  hostname: string;
  target: string;
};

export default function ExternalLinkGuard() {
  const [pending, setPending] = useState<PendingNavigation | null>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (anchor.dataset.allowExternal === "true") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href") ?? "";
      const origin = window.location.origin;
      if (!isExternalLink(href, origin)) return;

      const hostname = (() => {
        try {
          return new URL(href, origin).hostname;
        } catch {
          return href;
        }
      })();

      event.preventDefault();
      event.stopPropagation();

      setPending({
        href: anchor.href,
        hostname,
        target: event.metaKey || event.ctrlKey || anchor.target === "_blank" ? "_blank" : anchor.target || "_self",
      });
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const close = () => setPending(null);

  const proceed = () => {
    if (!pending) return;
    window.open(pending.href, pending.target || "_self", pending.target === "_blank" ? "noopener,noreferrer" : undefined);
    setPending(null);
  };

  useEffect(() => {
    if (!pending) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [pending]);

  if (!pending || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0e111a]/75 px-4 py-6 backdrop-blur"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="w-full max-w-lg space-y-4 rounded-3xl border border-white/15 bg-neutral-900/80 p-6 text-white shadow-2xl backdrop-blur-sm max-h-[calc(100vh-3rem)] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-amber-200">
            <ShieldAlert className="h-5 w-5" aria-hidden />
            <p className="text-xs uppercase tracking-[0.3em] text-amber-200">External link</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/70 transition hover:border-white/35 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Close external link warning</span>
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-white">You are leaving superfactorymanager</h2>
          <p className="text-sm text-white/70">
            We cannot guarantee that {pending.hostname} is safe. Continue to this site or stay on the current page.
          </p>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/80 wrap-break-word">
            {pending.href}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-white/35 hover:text-white"
          >
            Stay here
          </button>
          <button
            type="button"
            onClick={proceed}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-400/60 bg-brand-500/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-brand-300 hover:bg-brand-500/30"
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Continue
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
