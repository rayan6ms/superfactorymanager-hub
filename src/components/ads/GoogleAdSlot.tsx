"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

type Props = {
  slot: string;
  className?: string;
  layoutKey?: string;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function GoogleAdSlot({ slot, className, layoutKey }: Props) {
  const adRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const wrapper = adRef.current;
    if (!wrapper) return;

    const ins = wrapper.querySelector("ins.adsbygoogle") as HTMLElement | null;
    if (!ins) return;

    let pushed = false;

    const tryPush = () => {
      if (pushed) return;

      const hasRect = ins.getClientRects().length > 0;
      if (!hasRect || !ins.offsetWidth || !ins.offsetHeight) {
        return;
      }

      if (ins.getAttribute("data-adsbygoogle-status") === "done") {
        pushed = true;
        return;
      }

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        pushed = true;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "message" in err && typeof (err as { message: unknown }).message === "string"
              ? (err as { message: string }).message
              : "";

        if (msg.includes("No slot size for availableWidth=0")) {
          return;
        }

        if (process.env.NODE_ENV !== "production") {
          console.warn("[ads] Failed to push ad", err);
        }
      }
    };

    const id = window.setTimeout(tryPush, 0);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        tryPush();
      });
      ro.observe(ins);
    }

    return () => {
      window.clearTimeout(id);
      ro?.disconnect();
    };
  }, [slot]);

  if (!clientId) return null;

  return (
    <div ref={adRef}>
      <ins
        className={clsx("adsbygoogle block overflow-hidden", className)}
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        data-ad-layout-key={layoutKey}
      />
    </div>
  );
}
