export type ParsedDep = { url: string; source: "curseforge" | "modrinth"; slug: string; name: string };
export type ParsedDepTarget = Omit<ParsedDep, "url"> & { url: URL };

function isAllowedHost(hostname: string, domain: string) {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function buildDependencyName(slug: string) {
  return slug
    .split("-")
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function parseDependencyTarget(input: string | URL): ParsedDepTarget | null {
  const s = (input instanceof URL ? input.toString() : input).trim();
  try { new URL(s); } catch { return null; }

  const u = new URL(s);
  if (u.protocol !== "https:") {
    return null;
  }

  const cf = /^\/minecraft\/mc-mods\/([^/]+)\/?/i;
  const mr = /^\/mod\/([^/]+)\/?/i;

  let source: "curseforge" | "modrinth" | null = null;
  let slug = "";

  if (isAllowedHost(u.hostname, "curseforge.com")) {
    const m = u.pathname.match(cf);
    if (!m) return null;
    source = "curseforge";
    slug = m[1];
  } else if (isAllowedHost(u.hostname, "modrinth.com")) {
    const m = u.pathname.match(mr);
    if (!m) return null;
    source = "modrinth";
    slug = m[1];
  } else {
    return null;
  }

  return { url: u, source, slug, name: buildDependencyName(slug) };
}

export function parseDependency(input: string): ParsedDep | null {
  const parsed = parseDependencyTarget(input);
  if (!parsed) return null;

  return {
    url: parsed.url.toString(),
    source: parsed.source,
    slug: parsed.slug,
    name: parsed.name,
  };
}
