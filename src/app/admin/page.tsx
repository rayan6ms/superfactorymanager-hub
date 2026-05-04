import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderTree, Inbox, ShieldAlert, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";

const adminLinks = [
  {
    href: "/admin/reports",
    title: "Content reports",
    description: "Review open and solved user reports.",
    icon: ShieldAlert,
    countKey: "reports",
  },
  {
    href: "/admin/suggestions",
    title: "User suggestions",
    description: "Read messages submitted through the contact page.",
    icon: Inbox,
    countKey: "suggestions",
  },
  {
    href: "/admin/categories",
    title: "Categories",
    description: "Create and manage post categories.",
    icon: FolderTree,
    countKey: "categories",
  },
  {
    href: "/admin/deletions",
    title: "Deletion flags",
    description: "Restore posts and comments that were flagged as deleted.",
    icon: Trash2,
    countKey: "deletions",
  },
] as const;

export default async function AdminPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const [openReports, suggestions, categories, flaggedPosts, flaggedComments] = await Promise.all([
    db.report.count({ where: { resolvedAt: null } }),
    db.suggestion.count(),
    db.category.count(),
    db.post.count({ where: { isDeleted: true } }),
    db.comment.count({ where: { isDeleted: true } }),
  ]);

  const counts = {
    reports: `${openReports} open`,
    suggestions: `${suggestions} total`,
    categories: `${categories} total`,
    deletions: `${flaggedPosts + flaggedComments} flagged`,
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Admin tools</h1>
        <p className="text-sm text-white/60">Jump to moderation, cleanup, and site management pages.</p>
        <Link
          href="/"
          className="inline-flex text-sm font-medium text-brand-300 underline-offset-4 transition hover:underline"
        >
          ← Back to home
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {adminLinks.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group block no-underline">
              <Card hoverable className="flex h-full gap-4 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-brand-200">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 space-y-2">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-lg font-semibold text-white group-hover:text-brand-100">{item.title}</span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                      {counts[item.countKey]}
                    </span>
                  </span>
                  <span className="block text-sm text-white/60">{item.description}</span>
                </span>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
