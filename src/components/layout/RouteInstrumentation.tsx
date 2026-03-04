"use client";

import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const INSTRUMENTATION_EXCLUDED_ROUTE_PREFIXES = [
  "/admin",
  "/login",
  "/signup",
  "/verify-email",
  "/reset-password",
];

function shouldMountInstrumentation(pathname: string) {
  return !INSTRUMENTATION_EXCLUDED_ROUTE_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function RouteInstrumentation() {
  const pathname = usePathname() || "/";
  const isProduction = process.env.NODE_ENV === "production";

  if (!isProduction || !shouldMountInstrumentation(pathname)) {
    return null;
  }

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
