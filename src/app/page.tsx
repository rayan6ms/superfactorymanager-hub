"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { Search, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";

type Item = {
  id: string;
  slug: string;
  title: string;
  modVersion: string;
  views: number;
  rating: number;
  ratingCount: number;
  description: string;
  category: { name: string };
  authorName: string;
  tags?: { name: string; slug: string }[];
  images?: { thumbSm: string; thumbMd: string; thumbLg: string }[];
};

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const viewsFormatter = useMemo(
    () => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }),
    []
  );

  const runSearch = useCallback(async (search: string) => {
    setLoading(true);
    const res = await fetch(`/api/posts?q=${encodeURIComponent(search)}`);
    const data = await res.json();
    setItems(data.items || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      void runSearch(searchParams.get("q") || "");
    });
    return () => cancelAnimationFrame(id);
  }, [searchParams, runSearch]);

  return (
    <div className="space-y-10">
      <ul className="grid gap-5 md:grid-cols-2">
        {items.map(item => (
          <li key={item.id}>
            <Link href={`/posts/${item.slug}`} className="block">
              <Card className="p-5" hoverable>
                <div className="flex flex-col gap-4 sm:flex-row">
                  {item.images?.[0]?.thumbSm ? (
                    <img
                      src={item.images[0].thumbSm}
                      alt=""
                      width={160}
                      height={110}
                      className="h-[120px] w-full rounded-xl border border-white/10 object-cover sm:w-40"
                    />
                  ) : (
                    <div className="grid h-[120px] w-full place-items-center rounded-xl border border-white/10 bg-white/5 text-white/40 sm:w-40">
                      <Search className="h-5 w-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                      <Badge>{item.category?.name}</Badge>
                    </div>
                    <p className="text-sm text-white/70 line-clamp-2">{item.description}</p>
                    {item.tags?.length ? (
                      <div className="flex flex-wrap gap-1 text-xs text-white/50">
                        {item.tags.slice(0, 4).map(tag => (
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
                      <span>v{item.modVersion}</span>
                      <span>{viewsFormatter.format(item.views)} views</span>
                      <span className="inline-flex items-center gap-1 text-white">
                        <Star className="h-3 w-3 text-yellow-400" /> {(item.rating ?? 0).toFixed(1)} ({item.ratingCount ?? 0})
                      </span>
                      <span className="truncate text-white/50">by {item.authorName}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {!loading && items.length === 0 && (
        <Card className="p-8 text-center text-white/70">
          No results yet. Use the search card above to populate the feed.
        </Card>
      )}
    </div>
  );
}
