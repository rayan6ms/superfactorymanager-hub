"use client";

import Link from "next/link";

const MAX_SELECTED_TAGS = 3;

type TagOption = {
  id: string;
  name: string;
  slug: string;
  _count: {
    posts: number;
  };
};

type Props = {
  selectedSlugs: string[];
  tags: TagOption[];
};

function buildHref(selectedSlugs: string[], slug: string) {
  const selectedSet = new Set(selectedSlugs);
  const next = selectedSet.has(slug)
    ? selectedSlugs.filter(item => item !== slug)
    : selectedSet.size >= MAX_SELECTED_TAGS
      ? selectedSlugs
      : [...selectedSlugs, slug].sort();

  return next.length ? `/tags?tags=${next.join(",")}` : "/tags";
}

export default function TagSelector({ selectedSlugs, tags }: Props) {
  const selectedSet = new Set(selectedSlugs);

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => {
        const isActive = selectedSet.has(tag.slug);
        const isDisabled = !isActive && selectedSet.size >= MAX_SELECTED_TAGS;

        const className = `inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${isActive
          ? "border-brand-400 bg-brand-600/30 text-white"
          : isDisabled
            ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
            : "border-white/15 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
          }`;
        const content = (
          <>
            <span>#{tag.name}</span>
            <span className="text-xs text-white/60">
              {tag._count.posts}
            </span>
          </>
        );

        if (isDisabled) {
          return (
            <span key={tag.id} aria-disabled="true" className={className}>
              {content}
            </span>
          );
        }

        return (
          <Link
            key={tag.id}
            href={buildHref(selectedSlugs, tag.slug)}
            aria-current={isActive ? "page" : undefined}
            className={className}
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
