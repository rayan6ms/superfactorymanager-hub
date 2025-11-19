import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Search as SearchIcon, Star } from "lucide-react";
import type { SerializedPost } from "@/lib/posts";

const viewsFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

type Props = {
  post: SerializedPost;
};

function renderRating(rating: number | null | undefined, ratingCount: number | null | undefined) {
  const worked = Math.max(Math.round(rating ?? 0), 0);
  const total = Math.max(Math.round(ratingCount ?? 0), 0);
  const broken = Math.max(total - worked, 0);
  if (total === 0) return "No votes yet";
  const rate = Math.round((worked / Math.max(total, 1)) * 100);
  return `${rate}% success (${worked}\u2713 / ${broken}\u2715)`;
}

function getInitial(name: string | null | undefined) {
  const base = name?.trim();
  if (!base) return "?";
  return base.charAt(0).toUpperCase();
}

export default function PostCard({ post }: Props) {
  const image = post.images?.[0];
  const authorName = post.author?.name ?? post.authorName ?? "Unknown creator";
  const authorImage = post.author?.image ?? null;
  const authorProfile = post.author?.name ? `/profile/${post.author.name}` : null;
  return (
    <li>
      <Card className="p-5" hoverable>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link href={`/posts/${post.slug}`} className="flex flex-1 flex-col gap-4 sm:flex-row">
            {image ? (
              <img
                src={image.thumbLg || image.thumbMd || image.thumbSm}
                alt=""
                loading="lazy"
                className="h-[120px] w-full rounded-xl border border-white/10 object-cover sm:w-40"
              />
            ) : (
              <div className="grid h-[120px] w-full place-items-center rounded-xl border border-white/10 bg-white/5 text-white/40 sm:w-40">
                <SearchIcon className="h-5 w-5" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-white">{post.title}</h3>
                <Badge>{post.category?.name}</Badge>
              </div>
              <p className="text-sm text-white/70 line-clamp-2">{post.description}</p>
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
                <span>{viewsFormatter.format(post.views)} views</span>
                <span className="inline-flex items-center gap-1 text-white/80">
                  <Star className="h-3 w-3 text-amber-300" aria-hidden />
                  {renderRating(post.rating, post.ratingCount)}
                </span>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-white/80">
          {authorImage ? (
            <span
              className="h-9 w-9 shrink-0 rounded-full bg-cover bg-center"
              style={{ backgroundImage: `url(${authorImage})` }}
              aria-hidden="true"
            />
          ) : (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-semibold">
              {getInitial(authorName)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Author</p>
            {authorProfile ? (
              <Link href={authorProfile} className="truncate font-semibold text-white underline-offset-4 hover:underline">
                {authorName}
              </Link>
            ) : (
              <span className="truncate font-semibold text-white">{authorName}</span>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}
