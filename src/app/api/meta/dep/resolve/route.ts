import { NextResponse } from "next/server";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

function isAllowedHost(hostname: string, domain: string) {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function slugToName(u: URL) {
  const parts = u.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex(p => p === "mc-mods" || p === "mod");
  const slug = idx >= 0 ? parts[idx + 1] : parts[parts.length - 1];
  if (!slug) return null;
  return slug
    .split("-")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function clean(text: string) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[×]+/g, "")
    .trim();
}

function looksLikeCloudflare(html: string) {
  const t = html.toLowerCase();
  return (
    t.includes("just a moment") ||
    t.includes("checking your browser") ||
    t.includes("cf-") ||
    t.includes("cloudflare")
  );
}

async function extractNameFromHtml(html: string) {
  let m = html.match(/<div[^>]*class="[^"]*\bname-container\b[^"]*"[^>]*>[\s\S]*?<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m?.[1]) return clean(m[1]);

  m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (m?.[1]) return clean(m[1]);

  m = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (m?.[1]) return clean(m[1]);

  m = html.match(/<meta[^>]+name="twitter:title"[^>]+content="([^"]+)"/i);
  if (m?.[1]) return clean(m[1]);

  m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m?.[1]) return clean(m[1].replace(/-?\s*Minecraft Mods.*$/i, ""));

  return null;
}

export async function GET(req: Request) {
  const clientKey = getClientRateLimitKey(req.headers);
  const limit = await checkRateLimit(`meta:dep-resolve:client:${clientKey}`, {
    windowMs: 60 * 1000,
    limit: 60,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many metadata requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const u = new URL(req.url);
  const q = u.searchParams.get("url");
  if (!q) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let url: URL;
  try { url = new URL(q); } catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }

  if (!isAllowedHost(url.hostname, "curseforge.com") && !isAllowedHost(url.hostname, "modrinth.com")) {
    return NextResponse.json({ error: "URL must be CurseForge or Modrinth" }, { status: 400 });
  }

  try {
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 superfactorymanager" }
    });
    const html = await res.text();

    if (!html || looksLikeCloudflare(html)) {
      const fallback = slugToName(url);
      if (fallback) return NextResponse.json({ name: fallback });
      return NextResponse.json({ error: "Could not resolve mod name" }, { status: 502 });
    }

    const name = await extractNameFromHtml(html);
    if (name) return NextResponse.json({ name });
  } catch {
  }

  const fallback = slugToName(url);
  if (fallback) return NextResponse.json({ name: fallback });
  return NextResponse.json({ error: "Could not resolve mod name" }, { status: 404 });
}
