"use client";

import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const selectedSet = new Set(selectedSlugs);

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map(tag => {
        const isActive = selectedSet.has(tag.slug);
        const isDisabled = !isActive && selectedSet.size >= MAX_SELECTED_TAGS;

        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={isActive}
            disabled={isDisabled}
            onClick={() => router.push(buildHref(selectedSlugs, tag.slug))}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${isActive
              ? "border-brand-400 bg-brand-600/30 text-white"
              : isDisabled
                ? "cursor-not-allowed border-white/10 bg-white/5 text-white/40"
                : "border-white/15 bg-white/5 text-white/80 hover:border-white/25 hover:bg-white/10"
              }`}
          >
            <span>#{tag.name}</span>
            <span className="text-xs text-white/60">
              {tag._count.posts}
            </span>
          </button>
        );
      })}
    </div>
  );
}
