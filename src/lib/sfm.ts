import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

const COOLDOWN_MS = 15 * 60 * 1000;
let lastFetchAt = 0;
let memoMatrix: { byGame: Record<string, string[]>; gameVersions: string[] } | null = null;

type Pair = {
  game: string;
  mod: string;
  fileId?: string | null;
  fileUrl?: string | null;
  uploadedAt?: Date | null;
  source: "curseforge" | "modrinth";
};

const FULL_VERSION_RE = /(?<![\d.])(\d+\.\d+(?:\.\d+)?)(?![\d.])/g;
const GAME_VERSION_RE = /(?<![\d.])(1\.\d+(?:\.\d+)?)(?![\d.])/g;
const KNOWN_MOD_VERSION_FIXUPS: Record<string, string> = {
  "30.0": "4.30.0",
  "31.0": "4.31.0",
};

function log(...a: unknown[]) {
  if (process.env.DEBUG_SFM === "1") console.info("[SFM]", ...a);
}

function looksLikeCloudflare(html: string) {
  const t = html.toLowerCase();
  return (
    t.includes("just a moment") ||
    t.includes("checking your browser") ||
    t.includes("cloudflare")
  );
}

function pushPair(map: Map<string, Set<string>>, g: string, m: string) {
  if (!map.has(g)) map.set(g, new Set());
  map.get(g)!.add(m);
}

function sortDescSemverish(arr: string[]) {
  return [...arr].sort((a, b) => {
    const A = a.split(".").map(Number), B = b.split(".").map(Number);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const ai = A[i] ?? 0, bi = B[i] ?? 0;
      if (ai !== bi) return bi - ai;
    }
    return b.localeCompare(a);
  });
}

function uniqPairs(pairs: Pair[]) {
  const m = new Map<string, Pair>();
  for (const p of pairs) m.set(`${p.game}|${p.mod}`, p);
  return [...m.values()];
}

function extractAllVersions(text: string) {
  return [...text.matchAll(FULL_VERSION_RE)].map(match => match[1]);
}

function normalizeKnownSfmModVersion(raw: string) {
  const trimmed = raw.trim();
  return KNOWN_MOD_VERSION_FIXUPS[trimmed] ?? trimmed;
}

function findModVersInText(text: string) {
  const versions = extractAllVersions(text)
    .filter(version => !version.startsWith("1."))
    .map(normalizeKnownSfmModVersion);
  return sortDescSemverish([...new Set(versions)]);
}

function extractFromFilename(raw: string) {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  let game = t.match(/(?:mc|minecraft)\s*v?(1\.\d+(?:\.\d+)?)/i)?.[1] ?? null;
  let mod = t.match(/(?:mc|minecraft)\s*v?1\.\d+(?:\.\d+)?\D+v?(\d+\.\d+(?:\.\d+)?)/i)?.[1] ?? null;

  let m = t.match(/(?:^|[-_\s])v?(\d+\.\d+(?:\.\d+)?)\s*[-_\s]+(?:mc|minecraft)\s*v?(1\.\d+(?:\.\d+)?)/i);
  if (m) {
    mod = m[1];
    game = m[2];
  }

  m = t.match(/(?:^|[-_\s])(1\.\d+(?:\.\d+)?)\s*[-_\s]+v?(\d+\.\d+(?:\.\d+)?)/i);
  if (!mod && m) {
    game = m[1];
    mod = m[2];
  }

  const nums = extractAllVersions(t);
  if (!game) game = [...t.matchAll(GAME_VERSION_RE)].map(match => match[1])[0] ?? null;
  if (!mod) mod = nums.find(version => version !== game) ?? null;

  if (game && mod) return { game, mod };
  return null;
}

function findGameVersInText(text: string) {
  const cleaned = text.replace(/\s+/g, " ");
  const all = [...cleaned.matchAll(GAME_VERSION_RE)].map(match => match[1]);
  return [...new Set(all)];
}

function parseDateMaybe(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function parseCurseForgeListPage(html: string) {
  const rows: {
    fileId: string | null;
    fileUrl: string | null;
    fileName: string;
    uploadedAtText: string;
    badgeText: string;
  }[] = [];

  const rowRe = /<a[^>]+class="[^"]*file-row-details[^"]*"[^>]+href="([^"]*\/files\/(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(html))) {
    const fileUrl = new URL(m[1], "https://www.curseforge.com").toString();
    const fileId = m[2] || null;
    const inner = m[3] || "";

    let fileName = "";
    let nm = inner.match(/<span[^>]+class="[^"]*\bname\b[^"]*"[^>]*title="([^"]+)"/i);
    if (nm?.[1]) fileName = nm[1].trim();
    if (!fileName) {
      nm = inner.match(/<span[^>]+class="[^"]*\bname\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (nm?.[1]) fileName = nm[1].replace(/<[^>]+>/g, " ").trim();
    }

    let uploadedAtText = "";
    const up = inner.match(/<div[^>]*>\s*<span[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
    if (up?.[1]) uploadedAtText = up[1].replace(/<[^>]+>/g, " ").trim();

    const badgeText = inner.replace(/<[^>]+>/g, " ");

    rows.push({ fileId, fileUrl, fileName, uploadedAtText, badgeText });
  }

  const out: Pair[] = [];
  for (const r of rows) {
    const combinedText = `${r.fileName} ${r.badgeText}`;
    const guessed = extractFromFilename(combinedText);
    const games = guessed ? [guessed.game] : findGameVersInText(combinedText);
    const mod = normalizeKnownSfmModVersion(guessed?.mod ?? findModVersInText(combinedText)[0] ?? "");
    const uploadedAt = parseDateMaybe(r.uploadedAtText);

    for (const g of games) {
      if (!g || !mod) continue;
      out.push({
        game: g,
        mod,
        fileId: r.fileId,
        fileUrl: r.fileUrl,
        uploadedAt,
        source: "curseforge",
      });
    }
  }
  return out;
}

async function fetchFromCurseForgeIncremental(): Promise<{ added: number; pairs: Pair[]; blocked: boolean }> {
  const PAGE_SIZE = 50;
  const slug = "super-factory-manager";
  const base = `https://www.curseforge.com/minecraft/mc-mods/${slug}/files/all`;
  const headers = {
    "user-agent": "Mozilla/5.0 superfactorymanager",
    "accept": "text/html,application/xhtml+xml",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
  } as Record<string, string>;

  let page = 1;
  let totalAdded = 0;
  const allPairs: Pair[] = [];
  let blocked = false;

  const existing = await db.sfmVersion.findMany({ select: { gameVersion: true, modVersion: true } });
  const known = new Set(existing.map(e => `${e.gameVersion}|${normalizeKnownSfmModVersion(e.modVersion)}`));

  while (true) {
    const url = `${base}?page=${page}&pageSize=${PAGE_SIZE}`;
    const res = await fetch(url, { cache: "no-store", headers }).catch(() => null);
    if (!res) { log("CF fetch failed", url); blocked = true; break; }
    const html = await res.text();
    if (looksLikeCloudflare(html)) { log("CF blocked by Cloudflare"); blocked = true; break; }

    log("CF fetched page", page, "chars", html.length);
    const parsed = parseCurseForgeListPage(html);
    if (!parsed.length) {
      log("CF no rows — stopping at page", page);
      break;
    }

    const pageUniq = uniqPairs(parsed);
    const newPairs = pageUniq.filter(p => !known.has(`${p.game}|${p.mod}`));
    if (newPairs.length === 0) {
      log("CF page", page, "no NEW pairs — stopping early");
      break;
    }

    await db.sfmVersion.createMany({
      data: newPairs.map(p => ({
        gameVersion: p.game,
        modVersion: p.mod,
        source: p.source,
        fileId: p.fileId ?? null,
        fileUrl: p.fileUrl ?? null,
        uploadedAt: p.uploadedAt ?? null,
        firstSeen: new Date(),
        lastSeen: new Date(),
      })),
    });

    newPairs.forEach(p => known.add(`${p.game}|${p.mod}`));
    totalAdded += newPairs.length;
    allPairs.push(...newPairs);
    log(`CF page ${page}: rows=${parsed.length}, new=${newPairs.length}, totalAdded=${totalAdded}`);
    page++;
  }

  return { added: totalAdded, pairs: allPairs, blocked };
}

async function fetchFromModrinthFallback(): Promise<Pair[]> {
  const url = "https://modrinth.com/mod/super-factory-manager/versions";
  const res = await fetch(url, { cache: "no-store" }).catch(() => null);
  if (!res) { log("MR fetch failed"); return []; }
  const html = await res.text();

  const out: Pair[] = [];
  const linkRe = /<a[^>]+href="\/mod\/super-factory-manager\/version\/[^"]+"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(linkRe)) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const modMatch = text.match(/Super\s+Factory\s+Manager\s+(\d+\.\d+(?:\.\d+)?)/i) || text.match(/\s(\d+\.\d+(?:\.\d+)?)(?:\s|$)/);
    if (!modMatch) continue;
    const mod = normalizeKnownSfmModVersion(modMatch[1]);
    const games = [...text.matchAll(/(1\.[0-9]+(?:\.[0-9]+)?)/g)].map(x => x[1]);
    const uniqueGames = [...new Set(games)];
    for (const g of uniqueGames) out.push({ game: g, mod, source: "modrinth" });
  }
  const uniq = uniqPairs(out);
  if (!uniq.length) {
    return [];
  }

  const existing = await db.sfmVersion.findMany({
    select: { gameVersion: true, modVersion: true },
  });
  const known = new Set(existing.map(row => `${row.gameVersion}|${normalizeKnownSfmModVersion(row.modVersion)}`));
  const newPairs = uniq.filter(pair => !known.has(`${pair.game}|${pair.mod}`));

  if (newPairs.length) {
    await db.sfmVersion.createMany({
      data: newPairs.map(p => ({
        gameVersion: p.game,
        modVersion: p.mod,
        source: p.source,
        firstSeen: new Date(),
        lastSeen: new Date(),
      })),
      skipDuplicates: true,
    });
  }
  return newPairs;
}

async function matrixFromDB() {
  const rows = await db.sfmVersion.findMany();
  const by = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.gameVersion === "1.5") continue;
    pushPair(by, r.gameVersion, normalizeKnownSfmModVersion(r.modVersion));
  }
  const games = sortDescSemverish([...by.keys()]);
  const byGame: Record<string, string[]> = {};
  for (const g of games) byGame[g] = sortDescSemverish([...by.get(g)!]);
  return { byGame, gameVersions: games };
}

const getCachedSfmMatrix = unstable_cache(
  async () => matrixFromDB(),
  ["sfm-matrix"],
  {
    revalidate: 60 * 60,
    tags: ["sfm-matrix"],
  },
);

async function repairKnownSfmVersionRows() {
  const brokenRows = await db.sfmVersion.findMany({
    where: { modVersion: { in: Object.keys(KNOWN_MOD_VERSION_FIXUPS) } },
    select: {
      id: true,
      gameVersion: true,
      modVersion: true,
    },
  });

  const fixedTargets = [...new Set(Object.values(KNOWN_MOD_VERSION_FIXUPS))];
  const impactedGames = [...new Set(brokenRows.map(row => row.gameVersion))];
  const existingFixedRows = brokenRows.length
    ? await db.sfmVersion.findMany({
      where: {
        gameVersion: { in: impactedGames },
        modVersion: { in: fixedTargets },
      },
      select: {
        gameVersion: true,
        modVersion: true,
      },
    })
    : [];

  const existingFixedPairs = new Set(existingFixedRows.map(row => `${row.gameVersion}|${row.modVersion}`));
  const idsToDelete: string[] = [];
  const idsToUpdateByTarget = new Map<string, string[]>();

  for (const row of brokenRows) {
    const fixedMod = KNOWN_MOD_VERSION_FIXUPS[row.modVersion];
    if (!fixedMod) continue;

    if (existingFixedPairs.has(`${row.gameVersion}|${fixedMod}`)) {
      idsToDelete.push(row.id);
      continue;
    }

    const ids = idsToUpdateByTarget.get(fixedMod) ?? [];
    ids.push(row.id);
    idsToUpdateByTarget.set(fixedMod, ids);
  }

  const operations = [];
  for (const [fixedMod, ids] of idsToUpdateByTarget) {
    if (!ids.length) continue;
    operations.push(
      db.sfmVersion.updateMany({
        where: { id: { in: ids } },
        data: { modVersion: fixedMod },
      }),
    );
  }

  if (idsToDelete.length) {
    operations.push(
      db.sfmVersion.deleteMany({
        where: { id: { in: idsToDelete } },
      }),
    );
  }

  operations.push(
    db.sfmVersion.deleteMany({
      where: { gameVersion: "1.5", source: "curseforge" },
    }),
  );

  if (operations.length) {
    await db.$transaction(operations);
  }
}

export async function getSfmMatrix(force = false) {
  if (force) {
    const { matrix } = await refreshSfm({ source: "both", ignoreCooldown: true });
    return matrix;
  }

  return getCachedSfmMatrix();
}

export async function refreshSfm(opts: { source: "cf" | "mr" | "both"; ignoreCooldown?: boolean }) {
  await repairKnownSfmVersionRows();
  const now = Date.now();
  if (!opts.ignoreCooldown && memoMatrix && (now - lastFetchAt <= COOLDOWN_MS)) {
    log("Skipping refresh due to cooldown");
    return { insertedCf: 0, insertedMr: 0, matrix: memoMatrix };
  }

  let insertedCf = 0;
  let insertedMr = 0;

  try {
    if (opts.source === "cf" || opts.source === "both") {
      const cf = await fetchFromCurseForgeIncremental();
      insertedCf = cf.added;
      if (cf.blocked) log("CF blocked; consider using Modrinth fallback now.");
      if ((cf.blocked || cf.added === 0) && (opts.source === "both")) {
        const before = await db.sfmVersion.count();
        await fetchFromModrinthFallback();
        const after = await db.sfmVersion.count();
        insertedMr = Math.max(0, after - before);
        log(`MR fallback inserted ${insertedMr} unique pairs`);
      }
    } else if (opts.source === "mr") {
      const before = await db.sfmVersion.count();
      await fetchFromModrinthFallback();
      const after = await db.sfmVersion.count();
      insertedMr = Math.max(0, after - before);
    }
  } finally {
    lastFetchAt = now;
    memoMatrix = await matrixFromDB();
  }

  return { insertedCf, insertedMr, matrix: memoMatrix! };
}
