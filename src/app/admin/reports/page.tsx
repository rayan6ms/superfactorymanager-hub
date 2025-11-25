import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import ReportActionControls from "./ReportActionControls";

type LoadedReport = Awaited<ReturnType<typeof loadReports>>[number];

function initials(value: string | null | undefined) {
  const base = value?.trim();
  if (!base) return "?";
  const [first, second] = base.split(" ");
  if (second) return `${first[0]}${second[0]}`.toUpperCase();
  return (first[0] ?? "?").toUpperCase();
}

function formatTarget(report: LoadedReport) {
  if (report.comment && report.comment.post) {
    return {
      label: `Comment on ${report.comment.post.title}`,
      href: `/posts/${report.comment.post.slug}#comment-${report.comment.id}`,
      removed: report.comment.isDeleted,
    };
  }

  if (report.post) {
    return {
      label: report.post.title,
      href: `/posts/${report.post.slug}`,
      removed: report.post.isDeleted,
    };
  }

  return { label: "Unknown target", href: null, removed: false };
}

function summarizeAction(action: LoadedReport["actions"][number]) {
  const items: string[] = [];
  const metadata = action.metadata as Record<string, unknown> | null;
  if (metadata) {
    if (metadata.flagTarget) items.push("Flagged target");
    if (metadata.flagAuthorPosts) items.push("Flagged all posts");
    if (metadata.flagAuthorComments) items.push("Flagged all comments");
    if (metadata.revokePostVotes) items.push("Revoked post votes");
    if (metadata.disableCreatePosts) items.push("Blocked new posts");
    if (metadata.disableCreateComments) items.push("Blocked new comments");
    if (metadata.disableVotePosts) items.push("Blocked post votes");
    if (metadata.disableVoteComments) items.push("Blocked comment votes");
    if (metadata.markResolved) items.push("Closed report");
    if (metadata.timeoutMinutes) items.push(`Timeout for ${metadata.timeoutMinutes} minutes`);
  }
  return items.join(" · ");
}

async function loadReports() {
  const [reports, counts] = await Promise.all([
    db.report.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        reporter: { select: { id: true, name: true, email: true, image: true } },
        post: {
          select: {
            id: true,
            title: true,
            slug: true,
            isDeleted: true,
            author: { select: { id: true, name: true, email: true, image: true } },
          },
        },
        comment: {
          select: {
            id: true,
            isDeleted: true,
            author: { select: { id: true, name: true, email: true, image: true } },
            post: { select: { slug: true, title: true } },
          },
        },
        actions: {
          include: { actor: { select: { id: true, name: true, email: true, image: true } } },
          orderBy: { createdAt: "desc" },
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
            const offender = report.comment?.author ?? report.post?.author ?? null;
            const reporterName = report.reporter?.name ?? "Unknown reporter";
            const offenderName = offender?.name ?? offender?.email ?? "Unknown user";
            return (
              <li key={report.id} className="px-5 py-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                  <span className="rounded-full bg-white/5 px-2 py-0.5 font-semibold text-white/80">
                    {report.resolvedAt ? "Resolved" : "Open"}
                  </span>
                  <span>{created}</span>
                  <span className="rounded-full border border-white/15 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-white/70">
                    ID: {report.id}
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr]">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Reporter</p>
                      <div className="mt-2 flex items-center gap-3">
                        {report.reporter?.image ? (
                          <span
                            className="h-12 w-12 rounded-full bg-cover bg-center ring-1 ring-white/15"
                            style={{ backgroundImage: `url(${report.reporter.image})` }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                            {initials(reporterName)}
                          </span>
                        )}
                        <div className="space-y-0.5">
                          {report.reporter?.name ? (
                            <Link
                              href={`/profile/${report.reporter.name}`}
                              className="text-sm font-semibold text-white hover:underline"
                            >
                              {report.reporter.name}
                            </Link>
                          ) : (
                            <p className="text-sm font-semibold text-white">{reporterName}</p>
                          )}
                          <p className="text-xs text-white/60">{report.reporter?.email ?? "No email on file"}</p>
                          {report.otherReportsByReporter > 0 && (
                            <p className="text-xs text-white/60">
                              {report.otherReportsByReporter} other report
                              {report.otherReportsByReporter === 1 ? "" : "s"} from this user
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Reported user</p>
                      <div className="mt-2 flex items-center gap-3">
                        {offender?.image ? (
                          <span
                            className="h-12 w-12 rounded-full bg-cover bg-center ring-1 ring-white/15"
                            style={{ backgroundImage: `url(${offender.image})` }}
                            aria-hidden="true"
                          />
                        ) : (
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white">
                            {initials(offenderName)}
                          </span>
                        )}
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-white">{offenderName}</p>
                          <p className="text-xs text-white/60">{offender?.email ?? "No email available"}</p>
                          <p className="text-xs text-white/60">
                            Target: {report.comment ? "Comment" : report.post ? "Post" : "Unknown"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Timestamps</p>
                      <p className="mt-2 text-sm text-white/80">Created: {new Date(report.createdAt).toLocaleString()}</p>
                      <p className="text-sm text-white/80">
                        Resolved: {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "Pending"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Message</p>
                      <p className="whitespace-pre-wrap text-sm text-white/85">{report.message}</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Content</p>
                        <span className="rounded-full border border-white/15 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-white/70">
                          {target.removed ? "Flagged" : "Active"}
                        </span>
                      </div>
                      {target.href ? (
                        <Link href={target.href} className="text-sm font-semibold text-brand-200 hover:text-brand-100 hover:underline">
                          {target.label}
                        </Link>
                      ) : (
                        <p className="text-sm text-white/80">{target.label}</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/50">History</p>
                        <span className="text-xs text-white/60">{report.actions.length} entr{report.actions.length === 1 ? "y" : "ies"}</span>
                      </div>
                      {report.actions.length === 0 ? (
                        <p className="text-xs text-white/60">No actions logged yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {report.actions.map(action => {
                            const summary = summarizeAction(action);
                            return (
                              <li key={action.id} className="rounded-lg border border-white/10 bg-black/40 p-3 space-y-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2 text-sm text-white">
                                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-white/70">
                                      {action.type.toLowerCase()}
                                    </span>
                                    <span>{action.actor?.name ?? action.actor?.email ?? "Admin"}</span>
                                  </div>
                                  <span className="text-xs text-white/60">{new Date(action.createdAt).toLocaleString()}</span>
                                </div>
                                {summary && <p className="text-xs text-white/70">{summary}</p>}
                                {action.note && <p className="text-xs text-white/80">Note: {action.note}</p>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
                      <p className="text-sm font-semibold text-white">Take action</p>
                      <ReportActionControls
                        reportId={report.id}
                        targetLabel={target.label}
                        defaultResolved={Boolean(report.resolvedAt)}
                      />
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
