import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatBuildDate, type BuildVisibility } from "@/lib/builds/profile-list";

type BuildCardProps = {
  username: string;
  slug: string;
  name: string;
  tag: string;
  visibility: BuildVisibility;
  createdAt: string | Date;
  updatedAt: string | Date;
  backTo?: "profile" | "builds" | "explore-builds" | "search";
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
  backTo,
  backHref,
}: BuildCardProps) {
  const baseHref = `/profile/${encodeURIComponent(username)}/builds/${encodeURIComponent(slug)}`;
  const query = new URLSearchParams();
  if (backTo) query.set("from", backTo);
  if (backHref) query.set("back", backHref);
  const suffix = query.toString();
  const href = suffix ? `${baseHref}?${suffix}` : baseHref;
  const createdDate = formatBuildDate(createdAt);
  const updatedDate = formatBuildDate(updatedAt);
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
          <h3 className="line-clamp-2 wrap-anywhere text-lg font-semibold text-white">{name}</h3>
          <Badge
            className="max-w-[11rem] shrink-0 truncate border-sky-400/30 bg-sky-500/10 text-sky-100"
          >
            {tag}
          </Badge>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="sm:flex gap-4 text-xs text-white/55">
            <p>Created {createdDate}</p>
            {showUpdated ?
              <div className="flex gap-4">
                <p className="hidden sm:block">|</p>
                <p>Updated {updatedDate}</p>
              </div>
              : null}
          </div>
          <Badge
            className={visibility === "PRIVATE"
              ? "shrink-0 border-rose-500/40 bg-rose-500/10 text-rose-200"
              : "shrink-0 border-emerald-500/35 bg-emerald-500/10 text-emerald-200"}
          >
            {visibility}
          </Badge>
        </div>
      </Card>
    </Link>
  );
}
