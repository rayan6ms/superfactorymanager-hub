"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Badge, Card } from "@/components/ui";
import { formatBuildDate, type BuildVisibility } from "@/lib/builds/profile-list-shared";

type BuildCardProps = {
  username: string;
  slug: string;
  name: string;
  tag: string;
  visibility: BuildVisibility;
  createdAt: string | Date;
  updatedAt: string | Date;
  showVisibility?: boolean;
  backTo?: "home" | "profile" | "builds" | "explore-builds" | "search";
  backHref?: string;
};

export default function BuildCard({
  username,
  slug,
  name,
  tag,
  visibility,
  createdAt,
  updatedAt,
  showVisibility = false,
  backTo,
  backHref,
}: BuildCardProps) {
  const { data: session } = useSession();
  const baseHref = `/profile/${encodeURIComponent(username)}/builds/${encodeURIComponent(slug)}`;
  const query = new URLSearchParams();
  if (backTo) query.set("from", backTo);
  if (backHref) query.set("back", backHref);
  const suffix = query.toString();
  const href = suffix ? `${baseHref}?${suffix}` : baseHref;
  const createdDate = formatBuildDate(createdAt);
  const updatedDate = formatBuildDate(updatedAt);
  const viewerUsername = session?.user?.name?.trim().toLowerCase() ?? null;
  const effectiveShowVisibility = showVisibility ?? viewerUsername === username.trim().toLowerCase();
  const createdTs = new Date(createdAt).getTime();
  const updatedTs = new Date(updatedAt).getTime();
  const showUpdated = Number.isFinite(createdTs) && Number.isFinite(updatedTs) && Math.abs(updatedTs - createdTs) > 1000;

  return (
    <Link
      href={href}
      className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0d12]"
    >
      <Card hoverable className="h-full space-y-3 p-5 backdrop-blur-none sm:backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 line-clamp-2 wrap-anywhere text-lg font-semibold text-white">{name}</h3>
          <div className="flex max-w-[11rem] shrink-0 flex-wrap justify-end gap-2">
            <Badge className="max-w-[11rem] truncate border-sky-400/30 bg-sky-500/10 text-sky-100">
              {tag}
            </Badge>
            {effectiveShowVisibility ? (
              <Badge
                className={visibility === "PRIVATE"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                  : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"}
              >
                {visibility}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-white/60">
            By <span className="font-medium text-white/80">{username}</span>
          </p>
          <div className="shrink-0 text-right text-xs text-white/55">
            <p>Created {createdDate}</p>
            {showUpdated ? <p>Updated {updatedDate}</p> : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}
