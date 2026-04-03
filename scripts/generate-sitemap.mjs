#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { BuildVisibility, PrismaClient } from "@prisma/client";

function getBaseUrl(defaultBase = "https://sfmhub.site") {
  const trimTrailingSlash = (value) => value.replace(/\/$/, "");
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  const vercelUrl = process.env.VERCEL_URL;
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv === "production") {
    return trimTrailingSlash(appUrl || defaultBase);
  }

  if (vercelEnv === "preview" && vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return trimTrailingSlash(withProtocol);
  }

  if (appUrl) return trimTrailingSlash(appUrl);

  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return trimTrailingSlash(withProtocol);
  }

  return trimTrailingSlash(defaultBase);
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeLastmod(value) {
  if (!(value instanceof Date)) return undefined;
  return value.toISOString();
}

function renderUrl(item) {
  const lines = [`    <loc>${escapeXml(item.loc)}</loc>`];
  if (item.lastmod) lines.push(`    <lastmod>${item.lastmod}</lastmod>`);
  if (item.changefreq) lines.push(`    <changefreq>${item.changefreq}</changefreq>`);
  if (typeof item.priority === "number") lines.push(`    <priority>${item.priority.toFixed(1)}</priority>`);
  return `  <url>\n${lines.join("\n")}\n  </url>`;
}

function addOrMergeUrl(urlMap, next) {
  const existing = urlMap.get(next.loc);
  if (!existing) {
    urlMap.set(next.loc, next);
    return;
  }

  if (next.lastmod && (!existing.lastmod || new Date(next.lastmod) > new Date(existing.lastmod))) {
    existing.lastmod = next.lastmod;
  }
  if (!existing.changefreq && next.changefreq) existing.changefreq = next.changefreq;
  if (typeof next.priority === "number") {
    existing.priority = typeof existing.priority === "number" ? Math.max(existing.priority, next.priority) : next.priority;
  }
}

function buildXml(items) {
  const sorted = [...items].sort((a, b) => a.loc.localeCompare(b.loc));
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    sorted.map(renderUrl).join("\n"),
    "</urlset>",
    "",
  ].join("\n");
}

async function generateSitemap() {
  const baseUrl = getBaseUrl();
  const prismaUrl = process.env.PRISMA_DATABASE_URL?.trim();
  const isAccelerateUrl = Boolean(
    prismaUrl
    && (prismaUrl.startsWith("prisma://") || prismaUrl.startsWith("prisma+postgres://")),
  );
  const directDatabaseUrl = process.env.POSTGRES_URL?.trim()
    || process.env.DATABASE_URL?.trim()
    || (!isAccelerateUrl ? prismaUrl : undefined);

  if (!directDatabaseUrl) {
    throw new Error("Sitemap generation requires a direct Postgres URL. Set POSTGRES_URL or DATABASE_URL.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: directDatabaseUrl }),
  });
  const urlMap = new Map();

  try {
    const [posts, users, builds] = await Promise.all([
      prisma.post.findMany({
        where: { isDeleted: false },
        select: { slug: true, updatedAt: true, uploadDate: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.user.findMany({
        where: {
          name: {
            not: null,
          },
        },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      prisma.build.findMany({
        where: {
          visibility: BuildVisibility.PUBLIC,
          user: {
            name: {
              not: null,
            },
          },
        },
        select: {
          slug: true,
          updatedAt: true,
          createdAt: true,
          user: {
            select: { name: true },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const staticRoutes = [
      { loc: `${baseUrl}/`, changefreq: "weekly", priority: 1 },
      { loc: `${baseUrl}/guide`, changefreq: "weekly", priority: 0.8 },
      { loc: `${baseUrl}/posts`, changefreq: "daily", priority: 0.8 },
      { loc: `${baseUrl}/tags`, changefreq: "weekly", priority: 0.7 },
      { loc: `${baseUrl}/code-editor`, changefreq: "monthly", priority: 0.6 },
      { loc: `${baseUrl}/contact`, changefreq: "monthly", priority: 0.5 },
      { loc: `${baseUrl}/changelog`, changefreq: "weekly", priority: 0.6 },
    ];

    for (const route of staticRoutes) {
      addOrMergeUrl(urlMap, route);
    }

    for (const post of posts) {
      addOrMergeUrl(urlMap, {
        loc: `${baseUrl}/posts/${encodeURIComponent(post.slug)}`,
        lastmod: normalizeLastmod(post.updatedAt || post.uploadDate),
        changefreq: "weekly",
        priority: 0.9,
      });
    }

    for (const user of users) {
      if (!user.name) continue;
      const encodedUsername = encodeURIComponent(user.name);
      addOrMergeUrl(urlMap, {
        loc: `${baseUrl}/profile/${encodedUsername}`,
        changefreq: "weekly",
        priority: 0.7,
      });
      addOrMergeUrl(urlMap, {
        loc: `${baseUrl}/profile/${encodedUsername}/posts`,
        changefreq: "weekly",
        priority: 0.6,
      });
      addOrMergeUrl(urlMap, {
        loc: `${baseUrl}/profile/${encodedUsername}/builds`,
        changefreq: "weekly",
        priority: 0.6,
      });
    }

    for (const build of builds) {
      if (!build.user?.name) continue;
      const encodedUsername = encodeURIComponent(build.user.name);
      addOrMergeUrl(urlMap, {
        loc: `${baseUrl}/profile/${encodedUsername}/builds/${encodeURIComponent(build.slug)}`,
        lastmod: normalizeLastmod(build.updatedAt || build.createdAt),
        changefreq: "weekly",
        priority: 0.7,
      });
    }

    const sitemapPath = path.join(process.cwd(), "public", "sitemap.xml");
    await fs.mkdir(path.dirname(sitemapPath), { recursive: true });
    await fs.writeFile(sitemapPath, buildXml(urlMap.values()), "utf8");
    console.log(`Sitemap generated: ${sitemapPath} (${urlMap.size} URLs)`);
  } finally {
    await prisma.$disconnect();
  }
}

generateSitemap().catch((error) => {
  console.error("Failed to generate sitemap.xml");
  console.error(error);
  process.exit(1);
});
