import { NextResponse } from "next/server";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const FETCH_TIMEOUT_MS = 5000;
const MAX_REMOTE_HTML_BYTES = 1_500_000;

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

class ResponseBodyTooLargeError extends Error {
  constructor() {
    super("REMOTE_BODY_TOO_LARGE");
    this.name = "ResponseBodyTooLargeError";
  }
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

function parseContentLengthHeader(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readTextWithLimit(res: Response, maxBytes: number) {
  const contentLength = parseContentLengthHeader(res.headers.get("content-length"));
  if (contentLength !== null && contentLength > maxBytes) {
    throw new ResponseBodyTooLargeError();
  }

  if (!res.body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).length > maxBytes) {
      throw new ResponseBodyTooLargeError();
    }
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new ResponseBodyTooLargeError();
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
    const res = await fetchWithTimeout(url.toString(), {
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 superfactorymanager" },
    });
    const html = await readTextWithLimit(res, MAX_REMOTE_HTML_BYTES);

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
