import Link from "next/link";
import PostCard from "@/components/posts/PostCard";
import Card from "@/components/ui/Card";
import { db } from "@/lib/db";
import { POST_CARD_INCLUDE, serializePost } from "@/lib/posts";

function parseTagsParam(value: string) {
  return value
    .split(",")
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean);
}

type Props = {
  searchParams?: Record<string, string | string[]>;
};

export default async function TagsPage({ searchParams }: Props) {
  const tagsParamRaw = searchParams?.tags;
  const selectedSlugs = typeof tagsParamRaw === "string" ? parseTagsParam(tagsParamRaw) : [];

  const tags = await db.tag.findMany({
    orderBy: { posts: { _count: "desc" } },
    include: { _count: { select: { posts: true } } },
  });

  const selectedSet = new Set(selectedSlugs);
  const sortedSelection = [...selectedSet].sort();

  const posts = selectedSlugs.length
    ? await db.post
        .findMany({
          where: {
            OR: selectedSlugs.map(slug => ({
              tags: {
                some: {
                  tag: {
                    OR: [
                      { slug },
                      { slug: { contains: slug } },
                      { name: { contains: slug, mode: "insensitive" } },
                    ],
                  },
                },
              },
            })),
          },
          orderBy: { uploadDate: "desc" },
          include: POST_CARD_INCLUDE,
          take: 30,
        })
        .then(items => items.map(serializePost))
    : [];

  const buildHref = (slug: string) => {
    const next = selectedSet.has(slug)
      ? sortedSelection.filter(item => item !== slug)
      : [...sortedSelection, slug].sort();
    const query = next.length ? `?tags=${next.join(",")}` : "";
    return `/tags${query}`;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="eyebrow">Tags</p>
        <h1 className="text-3xl font-semibold text-white">Discover tags</h1>
        <p className="text-white/70">
          Select one or more tags to surface posts that match or closely relate to them.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => {
            const isActive = selectedSet.has(tag.slug);
            return (
              <Link
                key={tag.id}
                href={buildHref(tag.slug)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
                  isActive
                    ? "border-brand-400 bg-brand-600/30 text-white"
                    : "border-white/15 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
                }`}
              >
                <span>#{tag.name}</span>
                <span className="text-xs text-white/60">{tag._count.posts}</span>
              </Link>
            );
          })}
        </div>
        {selectedSlugs.length > 1 && (
          <p className="mt-3 text-xs text-white/60">
            Multiple tags are separated by commas in the URL so you can share the filtered view.
          </p>
        )}
      </Card>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Tagged posts</h2>
        {selectedSlugs.length === 0 ? (
          <Card className="p-8 text-center text-white/70">Select a tag to see matching posts.</Card>
        ) : posts.length ? (
          <ul className="grid gap-5 md:grid-cols-2">
            {posts.map(post => (
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
