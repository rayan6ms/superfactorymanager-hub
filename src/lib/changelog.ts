import { db } from "@/lib/db";

const COOLDOWN_MS = 15 * 60 * 1000;
let lastFetchAt = 0;

export type ChangelogEntry = {
  id: string;
  versionCode: string;
  title: string;
  body: string;
  isLatest: boolean;
  publishedAt: Date | null;
  createdAt: Date;
};

type GithubRelease = {
  tag_name?: string;
  name?: string;
  body?: string;
  published_at?: string | null;
};

function normalizeVersion(release: GithubRelease) {
  return (release.tag_name || release.name || "").trim();
}

async function fetchGithubReleases(page: number, perPage = 20): Promise<GithubRelease[]> {
  const url = `https://api.github.com/repos/TeamDman/SuperFactoryManager/releases?page=${page}&per_page=${perPage}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "superfactorymanager-app",
    },
  }).catch(() => null);

  if (!res || !res.ok) return [];

  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function markLatestFlag() {
  const latest = await db.changelogEntry.findFirst({
    orderBy: [
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ],
  });

  await db.changelogEntry.updateMany({ data: { isLatest: false }, where: { isLatest: true } });
  if (latest) {
    await db.changelogEntry.update({ where: { id: latest.id }, data: { isLatest: true } });
  }
}

export async function refreshChangelog(opts?: { ignoreCooldown?: boolean }) {
  const now = Date.now();
  if (!opts?.ignoreCooldown && now - lastFetchAt < COOLDOWN_MS) {
    return { inserted: 0 };
  }

  const existing = await db.changelogEntry.findMany({ select: { versionCode: true } });
  const knownVersions = new Set(existing.map(v => v.versionCode));

  const newEntries: {
    versionCode: string;
    title: string;
    body: string;
    publishedAt: Date | null;
  }[] = [];

  let page = 1;
  let hitKnown = false;

  while (!hitKnown) {
    const releases = await fetchGithubReleases(page);
    if (!releases.length) break;

    for (const release of releases) {
      const versionCode = normalizeVersion(release);
      if (!versionCode) continue;

      if (knownVersions.has(versionCode)) {
        hitKnown = true;
        break;
      }

      knownVersions.add(versionCode);
      newEntries.push({
        versionCode,
        title: versionCode,
        body: (release.body || "").trim(),
        publishedAt: release.published_at ? new Date(release.published_at) : null,
      });
    }

    if (hitKnown) break;
    page += 1;
  }

  if (newEntries.length) {
    await db.changelogEntry.createMany({ data: newEntries });
    await markLatestFlag();
  }

  lastFetchAt = Date.now();
  return { inserted: newEntries.length };
}

export async function getChangelogEntries(opts?: { page?: number; limit?: number }): Promise<{ entries: ChangelogEntry[]; total: number }> {
  const pageSize = Math.max(1, Math.min(opts?.limit ?? 10, 50));
  const currentPage = Math.max(1, Math.floor(opts?.page ?? 1));
  const skip = (currentPage - 1) * pageSize;

  let [rows, total] = await Promise.all([
    db.changelogEntry.findMany({
      orderBy: [
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      skip,
      take: pageSize,
    }),
    db.changelogEntry.count(),
  ]);

  if (!total) {
    await refreshChangelog({ ignoreCooldown: true });
    [rows, total] = await Promise.all([
      db.changelogEntry.findMany({
        orderBy: [
          { publishedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: pageSize,
      }),
      db.changelogEntry.count(),
    ]);
  }

  return { entries: rows, total };
}
