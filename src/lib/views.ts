import { cookies } from "next/headers";

const COOKIE = "s_views_v1";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

type ViewMap = Record<string, number>;

async function readMap() {
  try {
    const store = await cookies();
    const raw = store.get(COOKIE)?.value;
    return raw ? (JSON.parse(raw) as ViewMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(map: ViewMap) {
  const store = await cookies();
  store.set({
    name: COOKIE,
    value: JSON.stringify(map),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
}

export async function shouldCountViewAndMark(postId: string) {
  const map = await readMap();
  const now = Date.now();

  for (const k of Object.keys(map)) {
    if (now - map[k] > TTL_MS) delete map[k];
  }

  const last = map[postId];
  const ok = !last || (now - last) > TTL_MS;

  if (ok) {
    map[postId] = now;
    await writeMap(map);
  }
  return ok;
}
