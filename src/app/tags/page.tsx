import Link from "next/link";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import DatabaseUnavailableNotice from "@/components/layout/DatabaseUnavailableNotice";
import PostCard from "@/components/posts/PostCard";
import Card from "@/components/ui/Card";
import Pagination from "@/components/ui/Pagination";
import { hasRecentDatabaseFallback, withDatabaseFallback } from "@/lib/db-availability";
import { db } from "@/lib/db";
import { POST_CARD_SELECT, serializePost } from "@/lib/posts";
import { parsePageParam, getTotalPages } from "@/lib/pagination";

export const revalidate = 60;
const PAGE_SIZE = 30;
const MAX_SELECTED_TAGS = 3;

function parseTagsParam(value: string) {
  return value
    .split(",")
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean);
}

function getSelectedSlugs(value: string | undefined) {
  if (!value) return [];
  return [...new Set(parseTagsParam(value))].sort().slice(0, MAX_SELECTED_TAGS);
}

const getCachedTagCount = unstable_cache(
  async () => db.tag.count(),
  ["tags-total-count"],
  { revalidate },
);

const getCachedTagPage = unstable_cache(
  async (skip: number, take: number) => db.tag.findMany({
    orderBy: { posts: { _count: "desc" } },
    include: { _count: { select: { posts: true } } },
    skip,
    take,
  }),
  ["tags-page"],
  { revalidate },
);

const getCachedTaggedPosts = unstable_cache(
  async (selectedSlugs: string[]) => {
    if (!selectedSlugs.length) {
      return [];
    }

    const items = await db.post.findMany({
      where: {
        isDeleted: false,
        tags: {
          some: {
            tag: {
              slug: { in: selectedSlugs },
            },
          },
        },
      },
      orderBy: { uploadDate: "desc" },
      select: POST_CARD_SELECT,
      take: 30,
    });

    return items.map(serializePost);
  },
  ["tagged-posts"],
  { revalidate },
);

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParams;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = searchParams ? await searchParams : {};
  const rawTags = params.tags;
  const tagsParam = Array.isArray(rawTags) ? rawTags[0] : rawTags;
  const selectedSlugs = typeof tagsParam === "string" ? getSelectedSlugs(tagsParam) : [];
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const requestedPage = parsePageParam(pageParam, 1);
  const shouldIndex = selectedSlugs.length === 0 && requestedPage <= 1;

  return {
    title: "Tags",
    description: "Browse the tag directory and jump into tagged SFMHub posts.",
    alternates: {
      canonical: "/tags",
    },
    robots: {
      index: shouldIndex,
      follow: shouldIndex,
    },
  };
}

export default async function TagsPage({ searchParams }: Props) {
  const params = searchParams ? await searchParams : {};

  const rawTags = params.tags;
  const tagsParam =
    Array.isArray(rawTags) ? rawTags[0] : rawTags;

  const selectedSlugs =
    typeof tagsParam === "string" ? getSelectedSlugs(tagsParam) : [];
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const requestedPage = parsePageParam(pageParam, 1);

  const totalTags = await withDatabaseFallback(() => getCachedTagCount(), 0);
  const totalPages = getTotalPages(totalTags, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, totalPages);
  const skip = (currentPage - 1) * PAGE_SIZE;

  const tags = await withDatabaseFallback(
    () => getCachedTagPage(skip, PAGE_SIZE),
    [],
  );

  const selectedSet = new Set(selectedSlugs);
  const sortedSelection = [...selectedSet];

  const posts = selectedSlugs.length
    ? await withDatabaseFallback(
      () => getCachedTaggedPosts(selectedSlugs),
      [],
    )
    : [];
  const isDegraded = hasRecentDatabaseFallback();

  const buildHref = (slug: string) => {
    const next = selectedSet.has(slug)
      ? sortedSelection.filter(item => item !== slug)
      : selectedSet.size >= MAX_SELECTED_TAGS
        ? sortedSelection
        : [...sortedSelection, slug].sort();
    const query = next.length ? `?tags=${next.join(",")}` : "";
    return `/tags${query}`;
  };

  const buildPageHref = (page: number) => {
    const query = new URLSearchParams();
    if (selectedSlugs.length) {
      query.set("tags", selectedSlugs.join(","));
    }
    if (page > 1) query.set("page", String(page));
    const suffix = query.toString();
    return suffix ? `/tags?${suffix}` : "/tags";
  };

  return (
    <div className="space-y-6">
      {isDegraded ? <DatabaseUnavailableNotice /> : null}
      <div className="space-y-3">
        <p className="eyebrow">Tags</p>
        <h1 className="text-3xl font-semibold text-white">
          Discover tags
        </h1>
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to home
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <p className="text-white/70 sm:flex-1">
            Select up to {MAX_SELECTED_TAGS} tags to surface posts
            that match them.
          </p>

          <p className="text-xs uppercase tracking-[0.3em] text-white/50 sm:ml-auto sm:text-right whitespace-nowrap">
            Showing {tags.length} {tags.length === 1 ? "tag" : "tags"}
          </p>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => {
            const isActive = selectedSet.has(tag.slug);
            const isDisabled = !isActive && selectedSet.size >= MAX_SELECTED_TAGS;
            return (
              <Link
                key={tag.id}
                href={buildHref(tag.slug)}
                aria-disabled={isDisabled || undefined}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${isActive
                  ? "border-brand-400 bg-brand-600/30 text-white"
                  : isDisabled
                    ? "border-white/10 bg-white/5 text-white/40"
                    : "border-white/15 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
                  }`}
              >
                <span>#{tag.name}</span>
                <span className="text-xs text-white/60">
                  {tag._count.posts}
                </span>
              </Link>
            );
          })}
        </div>
        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          total={totalTags}
          buildHref={buildPageHref}
          className="mt-4"
        />
        {selectedSlugs.length > 1 && (
          <p className="mt-3 text-xs text-white/60">
            Multiple tags are separated by commas in the URL so you
            can share the filtered view. Filtered tag views are not indexed.
          </p>
        )}
        {selectedSlugs.length >= MAX_SELECTED_TAGS && (
          <p className="mt-3 text-xs text-white/60">
            Remove a tag to add a different one.
          </p>
        )}
      </Card>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">
          Tagged posts
        </h2>
        {selectedSlugs.length === 0 ? (
          <Card className="p-8 text-center text-white/70">
            Select a tag to see matching posts.
          </Card>
        ) : posts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </ul>
        ) : (
          <Card className="p-8 text-center text-white/70">
            No posts found for the selected{" "}
            {selectedSlugs.length > 1 ? "tags" : "tag"}.
          </Card>
        )}
      </section>
    </div>
  );
}
