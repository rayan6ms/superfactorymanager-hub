import { NextResponse } from "next/server";
import { getBaseUrl } from "@/lib/urls";

export function GET() {
  const baseUrl = getBaseUrl();
  const body = `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
