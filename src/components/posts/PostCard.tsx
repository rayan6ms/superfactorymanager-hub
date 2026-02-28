import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Eye, Search as SearchIcon, Star, Check, X } from "lucide-react";
import type { SerializedPost } from "@/lib/posts";
import { wilsonScore, WILSON_Z_80 } from "@/lib/wilson-score";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizePostDescription } from "@/lib/post-description";

const viewsFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

type Props = {
  post: SerializedPost;
  compact?: boolean;
};

function renderRating(
  rating: number | null | undefined,
  ratingCount: number | null | undefined,
  workedCount?: number | null | undefined,
  brokenCount?: number | null | undefined,
): ReactNode {
  const worked = Math.max(0, Math.round(workedCount ?? 0));
  const broken = Math.max(0, Math.round(brokenCount ?? 0));
  const hasSplitCounts = worked + broken > 0;

  const rawTotalCount = Math.max(0, Math.round(ratingCount ?? 0));
  const total = hasSplitCounts ? worked + broken : rawTotalCount;

  if (total === 0) return "No votes yet";

  let score: number | null = null;

  if (typeof rating === "number" && Number.isFinite(rating)) {
    score = rating;
  }

  if ((score === null || Number.isNaN(score)) && hasSplitCounts && total > 0) {
    score = wilsonScore(worked, broken, WILSON_Z_80);
  }

  if (score === null || Number.isNaN(score)) {
    if (hasSplitCounts && total > 0) {
      score = worked / total;
    } else {
      score = 0;
    }
  }

  score = Math.max(0, Math.min(1, score));
  const successPercent = Math.round(score * 100);

  if (!hasSplitCounts) {
    return (
      <>
        {successPercent}% success{" "}
        <span className="inline-flex items-center gap-1">
          (<span>{total}</span>
          <span className="sr-only">
            {" "}
            vote{total === 1 ? "" : "s"}
          </span>
          )
        </span>
      </>
    );
  }

  return (
    <>
      {successPercent}% success{" "}
      <span className="inline-flex items-center gap-1">
        (
        <span className="inline-flex items-center gap-0.5">
          <span className="text-emerald-400">
            <Check className="h-3 w-3 inline-block" aria-hidden="true" />
          </span>
          <span>{worked}</span>
          <span className="sr-only">
            {" "}
            positive vote{worked === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-white/30">/</span>
        <span className="inline-flex items-center gap-0.5">
          <span className="text-red-400">
            <X className="h-3 w-3 inline-block" aria-hidden="true" />
          </span>
          <span>{broken}</span>
          <span className="sr-only">
            {" "}
            negative vote{broken === 1 ? "" : "s"}
          </span>
        </span>
        )
      </span>
    </>
  );
}

function getInitial(name: string | null | undefined) {
  const base = name?.trim();
  if (!base) return "?";
  return base.charAt(0).toUpperCase();
}

export default function PostCard({ post, compact = false }: Props) {
  const image = post.images?.[0];
  const imageSrc =
    image?.thumbLg || image?.thumbMd || image?.thumbSm || image?.original || null;

  const authorName = post.author?.name ?? post.authorName ?? "Unknown creator";
  const authorImage = post.author?.image ?? null;
  const description = normalizePostDescription(post.description);

  if (compact) {
    return (
      <li>
        <Link href={`/posts/${post.slug}`} className="block">
          <Card className="space-y-3 p-4 backdrop-blur-none sm:backdrop-blur-sm" hoverable>
            <div className="flex flex-col gap-3 sm:flex-row">
              {imageSrc ? (
                <div className="relative h-[120px] w-full overflow-hidden rounded-xl border border-white/10 sm:w-40 sm:shrink-0">
                  <Image
                    src={imageSrc}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 160px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="grid h-[120px] w-full place-items-center rounded-xl border border-white/10 bg-white/5 text-white/40 sm:w-40 sm:shrink-0">
                  <SearchIcon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 space-y-2">
                <h3 className="text-base font-semibold leading-snug text-white">
                  <span className="wrap-anywhere">{post.title}</span>
                  {post.category?.name ? (
                    <>
                      {" "}
                      <Badge className="translate-y-[-0.05rem] align-middle">{post.category.name}</Badge>
                    </>
                  ) : null}
                </h3>
                <div className="prose prose-invert prose-sm max-w-none line-clamp-2 whitespace-pre-line prose-p:my-0 prose-strong:text-white prose-em:text-white/90 prose-li:text-white/80 text-white/70">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {description}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            {post.tags?.length ? (
              <div className="flex flex-wrap gap-1 text-xs text-white/50">
                {post.tags.slice(0, 4).map(tag => (
                  <span
                    key={tag.slug || tag.name}
                    className="rounded-full border border-white/10 px-2 py-0.5 text-[0.7rem] text-white/65"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-white/60">
              <span>v{post.modVersion}</span>
              <div className="flex items-center gap-1">
                <Eye className="flex h-4 w-4" aria-hidden="true" />
                <span>{viewsFormatter.format(post.views)} views</span>
              </div>
              <span className="inline-flex items-center gap-1 text-white/80">
                <Star className="h-3 w-3 text-amber-300" aria-hidden />
                {renderRating(
                  post.rating,
                  post.ratingCount,
                  post.workedCount,
                  post.brokenCount,
                )}
              </span>
            </div>
          </Card>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <Link href={`/posts/${post.slug}`} className="block">
        <Card className="p-5" hoverable>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="w-full sm:w-40 flex flex-col justify-between gap-3">
              {imageSrc ? (
                <div className="relative h-[120px] w-full overflow-hidden rounded-xl border border-white/10">
                  <Image
                    src={imageSrc}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 160px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="grid h-[120px] w-full place-items-center rounded-xl border border-white/10 bg-white/5 text-white/40">
                  <SearchIcon className="h-5 w-5" />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-white/80">
                {authorImage ? (
                  <span
                    className="h-8 w-8 shrink-0 rounded-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${authorImage})` }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
                    {getInitial(authorName)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[0.6rem] uppercase tracking-[0.25em] text-white/45">
                    Author
                  </p>
                  <p className="truncate text-sm font-semibold text-white">
                    {authorName}
                  </p>
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <h3 className="text-lg font-semibold leading-snug text-white">
                <span className="wrap-anywhere">{post.title}</span>
                {post.category?.name ? (
                  <>
                    {" "}
                    <Badge className="translate-y-[-0.05rem] align-middle">{post.category.name}</Badge>
                  </>
                ) : null}
              </h3>
              <div className="prose prose-invert prose-sm max-w-none line-clamp-2 whitespace-pre-line prose-p:my-0 prose-strong:text-white prose-em:text-white/90 prose-li:text-white/80 text-white/70">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {description}
                </ReactMarkdown>
              </div>
              {post.tags?.length ? (
                <div className="flex flex-wrap gap-1 text-xs text-white/50">
                  {post.tags.slice(0, 4).map(tag => (
                    <span
                      key={tag.slug || tag.name}
                      className="rounded-full border border-white/10 px-2 py-0.5 text-[0.7rem] text-white/65"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs text-white/60">
                <span>v{post.modVersion}</span>
                <div className="flex items-center gap-1">
                  <Eye className="flex h-4 w-4" aria-hidden="true" />
                  <span>{viewsFormatter.format(post.views)} views</span>
                </div>
                <span className="inline-flex items-center gap-1 text-white/80">
                  <Star className="h-3 w-3 text-amber-300" aria-hidden />
                  {renderRating(
                    post.rating,
                    post.ratingCount,
                    post.workedCount,
                    post.brokenCount,
                  )}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </li>
  );
}
