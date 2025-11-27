import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ReportReason } from "@prisma/client";
import { Card } from "@/components/ui";
import Pagination from "@/components/ui/Pagination";
import { auth } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { db } from "@/lib/db";
import { parsePageParam, getTotalPages } from "@/lib/pagination";
import ReportActionControls from "./ReportActionControls";
import ReopenReportButton from "./ReopenReportButton";

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

function formatReason(reason: ReportReason) {
  switch (reason) {
    case ReportReason.SPAM:
      return "Spam";
    case ReportReason.INAPPROPRIATE_CONTENT:
      return "Inappropriate content";
    case ReportReason.HARASSMENT_OR_BULLYING:
      return "Harassment or Bullying";
    case ReportReason.SPREADS_FALSE_INFORMATION:
      return "Spreads false information";
    case ReportReason.HATE_SPEECH_OR_SYMBOLS:
      return "Hate speech or symbols";
    case ReportReason.PROMOTES_VIOLENCE_OR_DANGEROUS_BEHAVIOR:
      return "Promotes violence or dangerous behavior";
    case ReportReason.PROMOTES_ILLEGAL_ACTIVITY:
      return "Promotes illegal activity";
    case ReportReason.PROMOTES_SELF_HARM_OR_SUICIDE:
      return "Promotes self-harm or suicide";
    case ReportReason.OTHER:
    default:
      return "Other";
  }
}

async function loadReports(where: { resolvedAt?: { equals?: Date | null; not?: null } }, skip: number, take: number, reporterCountMap: Map<string | null, number>) {
  const reports = await db.report.findMany({
    where,
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
    skip,
    take,
  });

  return reports.map(report => ({
    ...report,
    otherReportsByReporter: Math.max(0, (reporterCountMap.get(report.reporterId ?? null) ?? 1) - 1),
  }));
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};

  const tabParam = resolvedSearchParams.tab;
  const tab = Array.isArray(tabParam) ? tabParam[0] : tabParam;

  const activeTab = tab === "solved" ? "solved" : "open";

  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    notFound();
  }

  const reporterCounts = await db.report.groupBy({ by: ["reporterId"], _count: { _all: true } });
  const reporterCountMap = new Map(reporterCounts.map(item => [item.reporterId ?? null, item._count._all]));

  const PAGE_SIZE = 20;
  const pageParam = resolvedSearchParams.page;
  const requestedPage = parsePageParam(Array.isArray(pageParam) ? pageParam[0] : pageParam, 1);

  const openCountPromise = db.report.count({ where: { resolvedAt: null } });
  const solvedCountPromise = db.report.count({ where: { resolvedAt: { not: null } } });

  const [openCount, solvedCount] = await Promise.all([openCountPromise, solvedCountPromise]);
  const totalCount = openCount + solvedCount;

  const activeWhere = activeTab === "solved" ? { resolvedAt: { not: null } } : { resolvedAt: null };
  const totalForTab = activeTab === "solved" ? solvedCount : openCount;
  const totalPages = getTotalPages(totalForTab, PAGE_SIZE);
  const currentPage = Math.min(requestedPage, totalPages);
  const reports = await loadReports(activeWhere, (currentPage - 1) * PAGE_SIZE, PAGE_SIZE, reporterCountMap);

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    if (activeTab === "solved") params.set("tab", "solved");
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    return suffix ? `/admin/reports?${suffix}` : "/admin/reports";
  };

  const openReports = activeTab === "open" ? reports : [];
  const resolvedReports = activeTab === "solved" ? reports : [];

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
          <p className="text-2xl font-semibold text-white">{openCount}</p>
          <p className="text-xs text-white/60">Reports without a resolution timestamp.</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Solved</p>
          <p className="text-2xl font-semibold text-white">{solvedCount}</p>
          <p className="text-xs text-white/60">Reports closed by moderators.</p>
        </Card>
        <Card className="space-y-1 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Total</p>
          <p className="text-2xl font-semibold text-white">{totalCount}</p>
          <p className="text-xs text-white/60">Stored reports ordered by newest first.</p>
        </Card>
      </div>

      <Card className="divide-y divide-white/10 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Latest reports</h2>
            <p className="text-sm text-white/60">Includes reporter history and direct links to flagged content.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
              {reports.length} items
            </span>
            <div className="flex overflow-hidden rounded-full border border-white/15">
              <Link
                href="/admin/reports"
                className={`px-3 py-1 text-xs font-semibold transition ${activeTab === "open" ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
                  }`}
              >
                Open reports
              </Link>
              <Link
                href="/admin/reports?tab=solved"
                className={`px-3 py-1 text-xs font-semibold transition ${activeTab === "solved" ? "bg-white/10 text-white" : "text-white/70 hover:text-white"
                  }`}
              >
                Solved reports
              </Link>
            </div>
          </div>
        </div>

        {activeTab === "open" ? (
          openReports.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-white/60">No open reports.</div>
          ) : (
            <ul className="divide-y divide-white/10">
              {openReports.map(report => {
                const target = formatTarget(report);
                const created = formatDistanceToNow(new Date(report.createdAt), { addSuffix: true });
                const offender = report.comment?.author ?? report.post?.author ?? null;
                const reporterName = report.reporter?.name ?? "Unknown reporter";
                const offenderName = offender?.name ?? offender?.email ?? "Unknown user";
                return (
                  <li key={report.id} className="space-y-4 px-5 py-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 font-semibold text-white/80">Open</span>
                      <span>{created}</span>
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-white/70">
                        ID: {report.id}
                      </span>
                      <span className="rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-red-100">
                        {formatReason(report.reason)}
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
                          <p className="text-sm text-white/80">Resolved: Pending</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Reason</p>
                            <span className="rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-red-100">
                              {formatReason(report.reason)}
                            </span>
                          </div>
                          {report.message ? (
                            <p className="whitespace-pre-wrap text-sm text-white/85">{report.message}</p>
                          ) : (
                            <p className="text-sm text-white/70">No additional details were provided.</p>
                          )}
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
                                  <li key={action.id} className="space-y-1 rounded-lg border border-white/10 bg-black/40 p-3">
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
          )
        ) : resolvedReports.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-white/60">No solved reports yet.</div>
        ) : (
          <ul className="divide-y divide-white/10">
            {resolvedReports.map(report => {
              const target = formatTarget(report);
              const reporterName = report.reporter?.name ?? "Unknown reporter";
              const offender = report.comment?.author ?? report.post?.author ?? null;
              const offenderName = offender?.name ?? offender?.email ?? "Unknown user";
              const resolvedAgo = report.resolvedAt
                ? formatDistanceToNow(new Date(report.resolvedAt), { addSuffix: true })
                : null;
              return (
                <li key={report.id} className="space-y-3 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white/5 px-2 py-0.5 font-semibold text-white/80">Resolved</span>
                      <span className="rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-red-100">
                        {formatReason(report.reason)}
                      </span>
                      <span className="rounded-full border border-white/15 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-white/70">
                        ID: {report.id}
                      </span>
                    </div>
                    {resolvedAgo && <span className="text-white/60">{resolvedAgo}</span>}
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{target.label}</p>
                        {target.href ? (
                          <Link href={target.href} className="text-xs text-brand-200 hover:text-brand-100 hover:underline">
                            View
                          </Link>
                        ) : null}
                      </div>
                      <p className="text-xs text-white/60">
                        Reporter: {reporterName} • Reported user: {offenderName}
                      </p>
                      {report.message && <p className="text-xs text-white/70">Details: {report.message}</p>}
                    </div>

                    <div className="flex items-center gap-3">
                      <p className="text-xs text-white/60">
                        Resolved on {report.resolvedAt ? new Date(report.resolvedAt).toLocaleString() : "Unknown"}
                      </p>
                      <ReopenReportButton reportId={report.id} />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Pagination
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          total={totalForTab}
          buildHref={buildPageHref}
          className="px-5 py-4"
        />
      </Card>
    </div>
  );
}
