"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MAX_SELECTED_TAGS, TAG_PAGE_SIZE, tagPageHref } from "@/lib/tag-navigation";

type TagOption = { id: string; name: string; slug: string; _count: { posts: number } };
type Props = {
  selectedSlugs: string[];
  tags: TagOption[];
  selectedTags: TagOption[];
  currentPage: number;
  totalTags: number;
};

export default function TagSelector({
  selectedSlugs,
  tags,
  selectedTags,
  currentPage,
  totalTags,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selectedSet = new Set(selectedSlugs);
  const totalPages = Math.max(1, Math.ceil(totalTags / TAG_PAGE_SIZE));
  const navigate = (slugs: string[], page = 1) =>
    startTransition(() => router.push(tagPageHref(slugs, page), { scroll: false }));
  const toggle = (slug: string) =>
    navigate(
      selectedSet.has(slug)
        ? selectedSlugs.filter((item) => item !== slug)
        : [...selectedSlugs, slug],
      currentPage,
    );
  const visibleTags = [
    ...selectedTags.filter((tag) => !tags.some((item) => item.id === tag.id)),
    ...tags,
  ];

  return (
    <div className="space-y-4" aria-busy={pending}>
      {selectedSlugs.length > 0 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => navigate([])}
          className="text-sm text-brand-300 underline"
        >
          Clear selected tags
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        {visibleTags.map((tag) => {
          const isActive = selectedSet.has(tag.slug);
          const disabled = pending || (!isActive && selectedSet.size >= MAX_SELECTED_TAGS);
          const className = `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition focus-visible:outline-2 focus-visible:outline-brand-400 ${
            isActive
              ? "border-brand-400 bg-brand-600/30 text-white"
              : disabled
                ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                : "border-white/15 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
          }`;
          const content = (
            <>
              <span>#{tag.name}</span>
              <span className="text-xs text-white/60">{tag._count.posts}</span>
            </>
          );
          // Only single-topic URLs are discoverable links. Combining filters is a user action.
          return selectedSlugs.length === 0 ? (
            <Link
              key={tag.id}
              href={tagPageHref([tag.slug])}
              prefetch={false}
              className={className}
            >
              {content}
            </Link>
          ) : (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              aria-pressed={isActive}
              onClick={() => toggle(tag.slug)}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
      {selectedSlugs.length > 0 && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="text-white/60">
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || currentPage <= 1}
              onClick={() => navigate(selectedSlugs, currentPage - 1)}
              className="rounded-xl border border-white/20 px-3 py-2 disabled:opacity-40"
            >
              Previous tags
            </button>
            <button
              type="button"
              disabled={pending || currentPage >= totalPages}
              onClick={() => navigate(selectedSlugs, currentPage + 1)}
              className="rounded-xl border border-white/20 px-3 py-2 disabled:opacity-40"
            >
              Next tags
            </button>
          </div>
        </div>
      )}
      {pending && <output className="text-sm text-white/60">Updating tags…</output>}
    </div>
  );
}
