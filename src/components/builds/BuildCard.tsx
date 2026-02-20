import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatBuildDate, type BuildVisibility } from "@/lib/builds/profile-list";

type BuildCardProps = {
  username: string;
  slug: string;
  name: string;
  visibility: BuildVisibility;
  createdAt: string | Date;
  updatedAt: string | Date;
};

export default function BuildCard({
  username,
  slug,
  name,
  visibility,
  createdAt,
  updatedAt,
}: BuildCardProps) {
  const href = `/profile/${encodeURIComponent(username)}/builds/${encodeURIComponent(slug)}`;
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
      <Card hoverable className="h-full space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 wrap-anywhere text-lg font-semibold text-white">{name}</h3>
          <Badge
            className={visibility === "PRIVATE"
              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
              : "border-emerald-500/35 bg-emerald-500/10 text-emerald-200"}
          >
            {visibility}
          </Badge>
        </div>
        <div className="sm:flex gap-4 text-xs text-white/55">
          <p>Created {createdDate}</p>
          {showUpdated ?
            <div className='flex gap-4'>
              <p className="hidden sm:block">|</p>
              <p>Updated {updatedDate}</p>
            </div>
            : null}
        </div>
      </Card>
    </Link>
  );
}
