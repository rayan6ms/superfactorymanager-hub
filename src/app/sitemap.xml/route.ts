import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq?: "daily" | "weekly" | "monthly";
  priority?: number;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function renderUrl(item: SitemapUrl) {
  const parts = [`<loc>${escapeXml(item.loc)}</loc>`];
  if (item.lastmod) parts.push(`<lastmod>${item.lastmod}</lastmod>`);
  if (item.changefreq) parts.push(`<changefreq>${item.changefreq}</changefreq>`);
  if (typeof item.priority === "number") parts.push(`<priority>${item.priority.toFixed(1)}</priority>`);
  return `<url>${parts.join("")}</url>`;
}

export async function GET() {
  const baseUrl = getBaseUrl();

  const [posts, tags] = await Promise.all([
    db.post.findMany({
      where: { isDeleted: false },
      select: { slug: true, updatedAt: true, uploadDate: true },
      orderBy: { updatedAt: "desc" },
    }),
    db.tag.findMany({
      select: { slug: true },
      orderBy: { slug: "asc" },
    }),
  ]);

  const staticRoutes: SitemapUrl[] = [
    { loc: `${baseUrl}/`, changefreq: "weekly", priority: 1 },
    { loc: `${baseUrl}/guide`, changefreq: "weekly", priority: 0.8 },
    { loc: `${baseUrl}/posts`, changefreq: "daily", priority: 0.8 },
    { loc: `${baseUrl}/tags`, changefreq: "weekly", priority: 0.7 },
    { loc: `${baseUrl}/contact`, changefreq: "monthly", priority: 0.5 },
    { loc: `${baseUrl}/changelog`, changefreq: "weekly", priority: 0.6 },
  ];

  const postRoutes: SitemapUrl[] = posts.map(post => ({
    loc: `${baseUrl}/posts/${post.slug}`,
    lastmod: (post.updatedAt ?? post.uploadDate).toISOString(),
    changefreq: "weekly",
    priority: 0.9,
  }));

  const tagRoutes: SitemapUrl[] = tags.map(tag => {
    const url = new URL("/tags", baseUrl);
    url.searchParams.set("tags", tag.slug);
    return {
      loc: url.toString(),
      changefreq: "weekly",
      priority: 0.6,
    };
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    [...staticRoutes, ...postRoutes, ...tagRoutes].map(renderUrl).join("") +
    `</urlset>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
