import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";

function formatTarget(report: Awaited<ReturnType<typeof loadReports>>[number]) {
  if (report.comment && report.comment.post) {
    return {
      label: `Comment on ${report.comment.post.title}`,
      href: `/posts/${report.comment.post.slug}#comment-${report.comment.id}`,
    };
  }

  if (report.post) {
    return {
      label: report.post.title,
      href: `/posts/${report.post.slug}`,
    };
  }

  return { label: "Unknown target", href: null };
}

async function loadReports() {
  const [reports, counts] = await Promise.all([
    db.report.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        post: { select: { id: true, title: true, slug: true } },
        comment: {
          select: {
            id: true,
            post: { select: { slug: true, title: true } },
          },
        },
      },
    }),
    db.report.groupBy({ by: ["reporterId"], _count: { _all: true } }),
  ]);

  const countMap = new Map(counts.map(item => [item.reporterId, item._count._all]));

  return reports.map(report => ({
    ...report,
    otherReportsByReporter: Math.max(0, (countMap.get(report.reporterId) ?? 1) - 1),
  }));
}

export default async function AdminReportsPage() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const reports = await loadReports();
  const unresolved = reports.filter(report => !report.resolvedAt).length;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.3em] text-white/40">Admin</p>
        <h1 className="text-3xl font-semibold text-white">Content reports</h1>
        <p className="text-sm text-white/60">
          Review the latest abuse reports. Each entry highlights the reporter, their history, and the exact content
          location.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Open</p>
          <p className="text-2xl font-semibold text-white">{unresolved}</p>
          <p className="text-xs text-white/60">Reports without a resolution timestamp.</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Total</p>
          <p className="text-2xl font-semibold text-white">{reports.length}</p>
          <p className="text-xs text-white/60">Stored reports ordered by newest first.</p>
        </Card>
      </div>

      <Card className="divide-y divide-white/10 p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Latest reports</h2>
            <p className="text-sm text-white/60">Includes reporter history and direct links to flagged content.</p>
          </div>
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
            {reports.length} items
          </span>
        </div>

        {reports.length === 0 && (
          <div className="px-5 py-10 text-center text-sm text-white/60">No reports yet.</div>
        )}

        {reports.length > 0 && (
          <ul className="divide-y divide-white/10">
            {reports.map(report => {
              const target = formatTarget(report);
              const created = formatDistanceToNow(new Date(report.createdAt), { addSuffix: true });
              return (
                <li key={report.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                        <span className="rounded-full bg-white/5 px-2 py-0.5 font-semibold text-white/70">
                          {report.resolvedAt ? "Resolved" : "Open"}
                        </span>
                        <span>{created}</span>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-white/80">{report.message}</p>
                        <p className="text-xs text-white/50">Report ID: {report.id}</p>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-white/60">
                        <div className="space-y-1">
                          <p className="font-semibold text-white">Reporter</p>
                          {report.reporter?.name ? (
                            <Link
                              href={`/profile/${report.reporter.name}`}
                              className="text-brand-200 hover:text-brand-100 hover:underline"
                            >
                              {report.reporter.name}
                            </Link>
                          ) : (
                            <span>Unknown user</span>
                          )}
                          <p className="text-white/50">{report.reporter?.email ?? "No email on file"}</p>
                          {report.otherReportsByReporter > 0 && (
                            <p className="text-white/60">
                              {report.otherReportsByReporter} other report
                              {report.otherReportsByReporter === 1 ? "" : "s"} from this user
                            </p>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-white">Content</p>
                          {target.href ? (
                            <Link
                              href={target.href}
                              className="text-brand-200 hover:text-brand-100 hover:underline"
                            >
                              {target.label}
                            </Link>
                          ) : (
                            <span>{target.label}</span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="font-semibold text-white">Timestamps</p>
                          <p className="text-white/70">Created: {new Date(report.createdAt).toLocaleString()}</p>
                          <p className="text-white/70">
                            Resolved: {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "Pending"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
