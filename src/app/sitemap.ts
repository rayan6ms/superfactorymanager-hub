import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { getBaseUrl } from "@/lib/urls";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/guide",
    "/posts",
    "/tags",
    "/contact",
    "/changelog",
  ].map(path => ({
    url: `${baseUrl}${path || "/"}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.8,
    lastModified: new Date(),
  }));

  const posts = await db.post.findMany({
    where: { isDeleted: false },
    select: { slug: true, updatedAt: true, uploadDate: true },
  });

  const postEntries: MetadataRoute.Sitemap = posts.map(post => ({
    url: `${baseUrl}/posts/${post.slug}`,
    lastModified: post.updatedAt ?? post.uploadDate,
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  const tags = await db.tag.findMany({ select: { slug: true } });
  const tagEntries: MetadataRoute.Sitemap = tags.map(tag => ({
    url: `${baseUrl}/tags?tags=${encodeURIComponent(tag.slug)}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...postEntries, ...tagEntries];
}
