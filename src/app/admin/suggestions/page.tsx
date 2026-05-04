import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card, Badge } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { Inbox, Mail, User } from "lucide-react";
import { parsePageParam, getTotalPages } from "@/lib/pagination";

export default async function AdminSuggestionsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = searchParams ? await searchParams : undefined;
  const pageParam = params?.page;
  const requestedPage = parsePageParam(Array.isArray(pageParam) ? pageParam[0] : pageParam, 1);
  const PAGE_SIZE = 20;

  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const total = await db.suggestion.count();
  const totalPages = getTotalPages(total, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, totalPages);
  const suggestions = await db.suggestion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { id: true, name: true, email: true } },
    },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const buildPageHref = (page: number) => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    const suffix = qs.toString();
    return suffix ? `/admin/suggestions?${suffix}` : "/admin/suggestions";
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.3em] text-white/50">Admin</p>
        <h1 className="text-3xl font-semibold text-white">User suggestions</h1>
        <p className="text-sm text-white/70">
          Messages submitted through the contact page appear here for moderators to review.
        </p>
        <Link
          href="/admin"
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to admin
        </Link>
      </div>

      <Card className="divide-y divide-white/10 p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Latest messages</h2>
            <p className="text-sm text-white/60">Newest submissions appear first.</p>
          </div>
          <Badge className="border border-white/20 text-white/80">
            {total} item{total === 1 ? "" : "s"}
          </Badge>
        </div>

        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-white/60">
            <Inbox className="h-8 w-8" aria-hidden />
            <p>No suggestions yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/10">
            {suggestions.map(suggestion => (
              <li key={suggestion.id} className="space-y-3 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                    <User className="h-4 w-4" />
                    {suggestion.author?.name || suggestion.contactName || suggestion.author?.email || "Anonymous"}
                  </div>
                  {suggestion.contactEmail && (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
                      <Mail className="h-3.5 w-3.5" />
                      {suggestion.contactEmail}
                    </span>
                  )}
                  <span className="text-xs text-white/60">
                    {formatDistanceToNow(new Date(suggestion.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-white/90">{suggestion.message}</pre>
              </li>
            ))}
          </ul>
        )}

        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          total={total}
          buildHref={buildPageHref}
        />
      </Card>
    </div>
  );
}
