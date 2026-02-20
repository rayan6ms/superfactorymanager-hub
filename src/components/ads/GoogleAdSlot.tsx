"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

type Props = {
  slot: string;
  className?: string;
  format?: "auto" | "fixed";
  fullWidthResponsive?: boolean;
  layoutKey?: string;
  width?: number;
  height?: number;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function GoogleAdSlot({
  slot,
  className,
  format = "auto",
  fullWidthResponsive = true,
  layoutKey,
  width,
  height,
}: Props) {
  const adRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const wrapper = adRef.current;
    if (!wrapper) return;

    const ins = wrapper.querySelector("ins.adsbygoogle") as HTMLElement | null;
    if (!ins) return;

    const status = ins.getAttribute("data-adsbygoogle-status");
    if (status === "done") return;

    let cancelled = false;

    const tryPush = () => {
      if (cancelled) return;

      if (!ins.offsetWidth || !ins.offsetHeight) return;

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[ads] Failed to push ad", err);
        }
      }
    };

    const t = window.setTimeout(tryPush, 0);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => tryPush());
      ro.observe(ins);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      ro?.disconnect();
    };
  }, [slot]);

  if (!clientId) return null;

  const isFixed = format === "fixed";

  return (
    <div ref={adRef}>
      <ins
        className={clsx("adsbygoogle block overflow-hidden", className)}
        style={
          isFixed && width && height
            ? { display: "inline-block", width, height }
            : { display: "block" }
        }
        data-ad-client={clientId}
        data-ad-slot={slot}
        {...(!isFixed ? { "data-ad-format": "auto" } : {})}
        {...(!isFixed && fullWidthResponsive ? { "data-full-width-responsive": "true" } : {})}
        {...(layoutKey ? { "data-ad-layout-key": layoutKey } : {})}
      />
    </div>
  );
}