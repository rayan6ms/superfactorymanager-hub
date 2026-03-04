import { cookies } from "next/headers";

const COOKIE = "s_views_v1";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const MAX_TRACKED_POSTS = 64;

type ViewEntry = [postId: string, seenAt: number];
type ViewMap = Map<string, number>;

function toViewMap(raw: unknown): ViewMap {
  const map = new Map<string, number>();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [postId, seenAt] of Object.entries(raw)) {
      if (!postId) continue;
      if (typeof seenAt !== "number" || !Number.isFinite(seenAt)) continue;
      map.set(postId, seenAt);
    }
    return map;
  }

  if (!Array.isArray(raw)) {
    return map;
  }

  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) continue;
    const [postId, seenAt] = item;
    if (typeof postId !== "string" || !postId) continue;
    if (typeof seenAt !== "number" || !Number.isFinite(seenAt)) continue;
    map.set(postId, seenAt);
  }

  return map;
}

function pruneExpiredEntries(map: ViewMap, now: number): ViewMap {
  const next = new Map<string, number>();
  for (const [postId, seenAt] of map) {
    if (now - seenAt <= TTL_MS) {
      next.set(postId, seenAt);
    }
  }
  return next;
}

function toCookieEntries(map: ViewMap): ViewEntry[] {
  return Array.from(map.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(-MAX_TRACKED_POSTS);
}

async function readMap() {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE)?.value;
    return raw ? toViewMap(JSON.parse(raw)) : new Map<string, number>();
  } catch {
    return new Map<string, number>();
  }
}

async function writeMap(map: ViewMap) {
  const store = await cookies();
  store.set({
    name: COOKIE,
    value: JSON.stringify(toCookieEntries(map)),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function shouldCountViewAndMark(postId: string) {
  const now = Date.now();
  const map = pruneExpiredEntries(await readMap(), now);
  const last = map.get(postId);
  const ok = !last || (now - last) > TTL_MS;

  if (ok) {
    map.delete(postId);
    map.set(postId, now);
    await writeMap(map);
  }
  return ok;
}
