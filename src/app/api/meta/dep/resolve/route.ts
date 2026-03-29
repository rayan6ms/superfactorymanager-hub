import { NextResponse } from "next/server";
import { parseDependencyTarget } from "@/lib/deps";
import { checkRateLimit, getClientRateLimitKey } from "@/lib/request-security";

const FETCH_TIMEOUT_MS = 5000;
const MAX_REMOTE_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 2;

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

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function fetchAllowedDependencyPage(initialUrl: URL) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const res = await fetchWithTimeout(currentUrl.toString(), {
      cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 superfactorymanager" },
      redirect: "manual",
    });

    if (!isRedirectStatus(res.status)) {
      return res;
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error("Too many redirects");
    }

    const location = res.headers.get("location");
    if (!location) {
      throw new Error("Missing redirect location");
    }

    const redirected = new URL(location, currentUrl);
    const nextTarget = parseDependencyTarget(redirected);
    if (!nextTarget) {
      throw new Error("Dependency redirect left the allowed hosts");
    }

    currentUrl = nextTarget.url;
  }

  throw new Error("Unable to resolve dependency page");
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

  const dependency = parseDependencyTarget(q);
  if (!dependency) {
    return NextResponse.json(
      { error: "URL must be an HTTPS CurseForge or Modrinth mod page." },
      { status: 400 },
    );
  }

  try {
    const res = await fetchAllowedDependencyPage(dependency.url);
    if (!res.ok) {
      throw new Error(`Dependency resolver responded with ${res.status}`);
    }

    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("Unsupported dependency response content type");
    }

    const html = await readTextWithLimit(res, MAX_REMOTE_HTML_BYTES);

    if (!html || looksLikeCloudflare(html)) {
      return NextResponse.json({ name: dependency.name });
    }

    const name = await extractNameFromHtml(html);
    if (name) return NextResponse.json({ name });
  } catch {
  }

  return NextResponse.json({ name: dependency.name });
}
