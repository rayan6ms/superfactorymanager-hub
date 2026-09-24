import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import DatabaseUnavailableNotice from "@/components/layout/DatabaseUnavailableNotice";
import PostCard from "@/components/posts/PostCard";
import Card from "@/components/ui/Card";
import Pagination from "@/components/ui/Pagination";
import TagSelector from "@/app/tags/TagSelector";
import { hasRecentDatabaseFallback, withDatabaseFallback } from "@/lib/db-availability";
import { db } from "@/lib/db";
import { POST_CARD_SELECT, serializePost } from "@/lib/posts";
import { cache } from "react";
import {
  TAG_PAGE_SIZE as PAGE_SIZE,
  MAX_SELECTED_TAGS,
  resolveTagNavigation,
  tagPageHref,
  mergeTaggedPosts,
} from "@/lib/tag-navigation";
import { redirect } from "next/navigation";
import { CORE_SEO_KEYWORDS, uniqueKeywords } from "@/lib/seo";

export const revalidate = 60;
// One shared catalogue; arbitrary query strings cannot create extra catalogue cache entries.
const getCachedTags = unstable_cache(
  async () =>
    db.tag.findMany({
      orderBy: [{ posts: { _count: "desc" } }, { slug: "asc" }],
      select: { id: true, name: true, slug: true, _count: { select: { posts: true } } },
    }),
  ["tags-catalogue-v2"],
  { revalidate: 300 },
);
const getTags = cache(() => withDatabaseFallback(() => getCachedTags(), []));

const getCachedTaggedPosts = unstable_cache(
  async (slug: string) => {
    const items = await db.post.findMany({
      where: {
        isDeleted: false,
        tags: {
          some: {
            tag: {
              slug,
            },
          },
        },
      },
      orderBy: [{ uploadDate: "desc" }, { id: "desc" }],
      select: POST_CARD_SELECT,
      take: 30,
    });

    return items.map(serializePost);
  },
  ["tagged-posts-single-v2"],
  { revalidate },
);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParams;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const catalogue = await getTags();
  const {
    slugs: selectedSlugs,
    page: requestedPage,
    needsRedirect,
  } = resolveTagNavigation(
    params,
    catalogue.map((tag) => tag.slug),
  );
  const selectedTags = catalogue.filter((tag) => selectedSlugs.includes(tag.slug));
  const selectedTag =
    selectedSlugs.length === 1 ? selectedTags.find((tag) => tag.slug === selectedSlugs[0]) : null;
  const shouldIndex =
    !needsRedirect && requestedPage === 1 && (selectedSlugs.length === 0 || Boolean(selectedTag));
  const tagName = selectedTag?.name ?? selectedSlugs[0];
  const title = selectedTag
    ? `${tagName} Super Factory Manager Posts`
    : "Super Factory Manager Tags";
  const description = selectedTag
    ? `Browse SFMHub posts tagged ${tagName}: Super Factory Manager code, Minecraft automation builds, SFML examples, and community troubleshooting.`
    : "Browse SFMHub tags for Super Factory Manager code, SFM builds, Minecraft automation topics, Mekanism setups, AE2 automation, and SFML examples.";

  return {
    title,
    description,
    keywords: uniqueKeywords([
      ...CORE_SEO_KEYWORDS,
      tagName,
      selectedTag ? `Super Factory Manager ${tagName}` : null,
      selectedTag ? `SFM ${tagName}` : null,
      selectedTag ? `${tagName} Minecraft automation` : null,
    ]),
    alternates: {
      canonical: selectedTag ? `/tags?tags=${encodeURIComponent(selectedTag.slug)}` : "/tags",
    },
    robots: {
      index: shouldIndex,
      follow: selectedSlugs.length <= 1,
    },
  };
}

export default async function TagsPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};

  const catalogue = await getTags();
  const {
    slugs: selectedSlugs,
    page: currentPage,
    href,
    needsRedirect,
  } = resolveTagNavigation(
    params,
    catalogue.map((tag) => tag.slug),
  );
  // Avoid redirecting valid bookmarks to an empty catalogue during a database outage.
  const isDegraded = hasRecentDatabaseFallback();
  if (needsRedirect && !isDegraded) redirect(href);
  const totalTags = catalogue.length;
  const tags = catalogue.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedTags = catalogue.filter((tag) => selectedSlugs.includes(tag.slug));
  // Cache by individual existing tag, never by an arbitrary combination of tags.
  const posts = mergeTaggedPosts(
    await Promise.all(
      selectedSlugs.map((slug) => withDatabaseFallback(() => getCachedTaggedPosts(slug), [])),
    ),
  );
  const buildPageHref = (page: number) => tagPageHref([], page);

  return (
    <div className="space-y-6">
      {isDegraded ? <DatabaseUnavailableNotice /> : null}
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold text-white">Discover tags</h1>
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to home
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <p className="text-white/70 sm:flex-1">
            Select up to {MAX_SELECTED_TAGS} tags to surface posts that match them.
          </p>

          <p className="text-sm font-medium text-white/60 sm:ml-auto sm:text-right whitespace-nowrap">
            Showing {tags.length} {tags.length === 1 ? "tag" : "tags"}
          </p>
        </div>
      </div>

      <Card className="p-5">
        <TagSelector
          selectedSlugs={selectedSlugs}
          tags={tags}
          selectedTags={selectedTags}
          currentPage={currentPage}
          totalTags={totalTags}
        />
        {selectedSlugs.length === 0 && (
          <Pagination
            currentPage={currentPage}
            pageSize={PAGE_SIZE}
            total={totalTags}
            buildHref={buildPageHref}
            className="mt-4"
          />
        )}
        {selectedSlugs.length > 1 && (
          <p className="mt-3 text-xs text-white/60">
            Showing posts matching any selected tag. You can share this filtered view using its URL.
          </p>
        )}
        {selectedSlugs.length >= MAX_SELECTED_TAGS && (
          <p className="mt-3 text-xs text-white/60">Remove a tag to add a different one.</p>
        )}
      </Card>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Tagged posts</h2>
        {selectedSlugs.length === 0 ? (
          <Card className="p-8 text-center text-white/70">Select a tag to see matching posts.</Card>
        ) : posts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <Card className="p-8 text-center text-white/70">
            No posts found for the selected {selectedSlugs.length > 1 ? "tags" : "tag"}.
          </Card>
        )}
      </section>
    </div>
  );
}
