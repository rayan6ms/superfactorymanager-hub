"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

type Props = {
  slot: string;
  className?: string;
  format?: "auto" | "horizontal" | "fixed";
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
    const timers: number[] = [];
    const pushDelays = [0, 600, 1600];
    const isDev = process.env.NODE_ENV !== "production";
    let loggedZeroWidth = false;

    const pushAd = () => {
      if (cancelled) return;
      if (ins.getAttribute("data-adsbygoogle-status") === "done") return;

      const wrapperRect = wrapper.getBoundingClientRect();
      const insRect = ins.getBoundingClientRect();
      const wrapperStyle = window.getComputedStyle(wrapper);
      const isHidden = wrapperStyle.display === "none" || wrapperStyle.visibility === "hidden";
      const availableWidth = Math.round(insRect.width || wrapperRect.width || (format === "fixed" ? width ?? 0 : 0));
      const availableHeight = Math.round(insRect.height || wrapperRect.height || (format === "fixed" ? height ?? 0 : 0));

      if (isHidden || availableWidth <= 0 || availableHeight <= 0) {
        if (isDev && !loggedZeroWidth) {
          loggedZeroWidth = true;
          console.warn(
            `[ads] Skipping push for slot ${slot}: hidden=${isHidden}, width=${availableWidth}, height=${availableHeight}.`,
          );
        }
        return;
      }

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        if (isDev) {
          console.warn(`[ads] adsbygoogle.push failed for slot ${slot}`, error);
        }
      }
    };

    for (const delay of pushDelays) {
      timers.push(window.setTimeout(pushAd, delay));
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => pushAd());
      resizeObserver.observe(wrapper);
    }

    const missingAdsByGoogleTimer = window.setTimeout(() => {
      if (!isDev || cancelled) return;
      if (typeof window.adsbygoogle === "undefined") {
        console.warn(`[ads] window.adsbygoogle is undefined for slot ${slot}. Check AdSense script load or blockers.`);
      }
    }, 4000);
    timers.push(missingAdsByGoogleTimer);

    return () => {
      cancelled = true;
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
      resizeObserver?.disconnect();
    };
  }, [format, fullWidthResponsive, height, layoutKey, slot, width]);

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
        {...(!isFixed ? { "data-ad-format": format } : {})}
        {...(!isFixed && fullWidthResponsive ? { "data-full-width-responsive": "true" } : {})}
        {...(layoutKey ? { "data-ad-layout-key": layoutKey } : {})}
      />
    </div>
  );
}
