"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import AdsShell from "@/components/ads/AdsShell";

const ADS_ROUTE_PREFIXES = [
  "/",
  "/posts",
  "/builds",
  "/profile",
  "/search",
  "/tags",
  "/guide",
  "/contact",
  "/changelog",
];

function shouldMountAds(pathname: string) {
  return ADS_ROUTE_PREFIXES.some((prefix) =>
    prefix === "/"
      ? pathname === "/"
      : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function RouteAds() {
  const pathname = usePathname() || "/";
  const adsClient = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT;

  if (!adsClient || !shouldMountAds(pathname)) {
    return null;
  }

  return (
    <>
      <Script
        async
        strategy="afterInteractive"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsClient}`}
        crossOrigin="anonymous"
      />
      <AdsShell placement="desktop-rails" />
      <AdsShell placement="mobile-top" />
      <AdsShell placement="mobile-bottom" />
    </>
  );
}
