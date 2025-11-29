"use client";

import { useEffect } from "react";
import clsx from "clsx";

const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

type Props = {
  slot?: string;
  className?: string;
  layoutKey?: string;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function GoogleAdSlot({ slot, className, layoutKey }: Props) {
  useEffect(() => {
    if (!clientId) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn("[ads] Failed to push ad", error);
    }
  }, []);

  if (!clientId) return null;

  return (
    <ins
      className={clsx("adsbygoogle block overflow-hidden", className)}
      style={{ display: "block" }}
      data-ad-client={clientId}
      data-ad-slot={slot ?? "auto"}
      data-ad-format="auto"
      data-full-width-responsive="true"
      data-ad-layout-key={layoutKey}
    />
  );
}
