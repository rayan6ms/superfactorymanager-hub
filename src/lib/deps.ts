export type ParsedDep = { url: string; source: "curseforge" | "modrinth"; slug: string; name: string };

export function parseDependency(input: string): ParsedDep | null {
  const s = input.trim();
  try { new URL(s); } catch { return null; }

  const u = new URL(s);
  const cf = /^\/minecraft\/mc-mods\/([^/]+)\/?/i;
  const mr = /^\/mod\/([^/]+)\/?/i;

  let source: "curseforge" | "modrinth" | null = null;
  let slug = "";

  if (u.hostname.includes("curseforge.com")) {
    const m = u.pathname.match(cf);
    if (!m) return null;
    source = "curseforge";
    slug = m[1];
  } else if (u.hostname.includes("modrinth.com")) {
    const m = u.pathname.match(mr);
    if (!m) return null;
    source = "modrinth";
    slug = m[1];
  } else {
    return null;
  }

  const name = slug.split("-").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
  return { url: s, source, slug, name };
}
