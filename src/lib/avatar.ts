import "server-only";

import crypto from "crypto";
import dns from "node:dns/promises";
import net from "node:net";

const DATA_URL_PATTERN = /^data:image\//i;
const BASE64_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const REMOTE_URL_PATTERN = /^https?:\/\//i;
const REMOTE_TIMEOUT_MS = 5000;
const MAX_REMOTE_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set(["localhost"]);

const COLORS = [
  "#6366F1",
  "#EC4899",
  "#F97316",
  "#22C55E",
  "#14B8A6",
  "#F59E0B",
  "#8B5CF6",
  "#F43F5E",
  "#3B82F6",
  "#0EA5E9",
];

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    value = (value << 8) + octet;
  }

  return value >>> 0;
}

function ipv4IsBlocked(ip: string): boolean {
  const value = ipv4ToNumber(ip);
  if (value === null) return true;

  const firstOctet = value >>> 24;
  const secondOctet = (value >>> 16) & 0xff;

  if (firstOctet === 0) return true;
  if (firstOctet === 10) return true;
  if (firstOctet === 127) return true;
  if (firstOctet === 169 && secondOctet === 254) return true;
  if (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) return true;
  if (firstOctet === 192 && secondOctet === 0) return true;
  if (firstOctet === 192 && secondOctet === 168) return true;
  if (firstOctet === 198 && (secondOctet === 18 || secondOctet === 19)) return true;
  if (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) return true;
  if (firstOctet >= 224) return true;
  if (value === 0xffffffff) return true;

  return false;
}

function ipv6IsBlocked(ip: string): boolean {
  const normalized = ip.toLowerCase();

  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("ff")) return true;
  if (normalized.startsWith("2001:db8")) return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4?.[1]) {
    return ipv4IsBlocked(mappedIpv4[1]);
  }

  return false;
}

function isBlockedAddress(hostnameOrIp: string): boolean {
  const lower = normalizeHostname(hostnameOrIp);
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }

  const family = net.isIP(lower);
  if (family === 4) {
    return ipv4IsBlocked(lower);
  }
  if (family === 6) {
    return ipv6IsBlocked(lower);
  }

  return false;
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const records = await dns.lookup(normalizeHostname(hostname), { all: true, verbatim: true });
  return [...new Set(records.map((record) => record.address.toLowerCase()))];
}

async function validateRemoteUrl(url: string | URL): Promise<URL | null> {
  let parsed: URL;
  try {
    parsed = url instanceof URL ? new URL(url.toString()) : new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }

  const hostname = normalizeHostname(parsed.hostname);

  if (isBlockedAddress(hostname)) {
    return null;
  }

  if (net.isIP(hostname)) {
    return parsed;
  }

  let addresses: string[];
  try {
    addresses = await resolveHostAddresses(hostname);
  } catch {
    return null;
  }

  if (addresses.length === 0) {
    return null;
  }

  if (addresses.some(address => isBlockedAddress(address))) {
    return null;
  }

  return parsed;
}

function getColorIndex(seed: string) {
  if (!seed) return 0;
  const hash = crypto.createHash("sha256").update(seed).digest();
  return hash[0] % COLORS.length;
}

function getInitial(name: string) {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function generateInitialAvatar({ name, seed }: { name: string; seed?: string }) {
  const initial = getInitial(name);
  const color = COLORS[getColorIndex(seed ?? name)];
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>\n  <defs>\n    <linearGradient id='grad' x1='0%' y1='0%' x2='100%' y2='100%'>\n      <stop offset='0%' stop-color='${color}' stop-opacity='0.85'/>\n      <stop offset='100%' stop-color='${color}' stop-opacity='1'/>\n    </linearGradient>\n  </defs>\n  <circle cx='64' cy='64' r='60' fill='url(#grad)' stroke='white' stroke-width='4'/>\n  <text x='50%' y='50%' dy='0.35em' text-anchor='middle' fill='white' font-family='"Inter", "Segoe UI", sans-serif' font-size='64' font-weight='600'>${initial}</text>\n</svg>`;
  const encoded = encodeURIComponent(svg).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `data:image/svg+xml,${encoded}`;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type RemoteFetchResult = {
  response: Response;
  finalUrl: string;
};

async function fetchValidatedRemoteResource(
  inputUrl: string,
  init: RequestInit,
): Promise<RemoteFetchResult | null> {
  let currentUrl = await validateRemoteUrl(inputUrl);
  if (!currentUrl) {
    return null;
  }

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
    const response = await fetchWithTimeout(currentUrl.toString(), {
      ...init,
      cache: "no-store",
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === MAX_REMOTE_REDIRECTS) {
        return null;
      }

      const location = response.headers.get("location");
      if (!location) {
        return null;
      }

      currentUrl = await validateRemoteUrl(new URL(location, currentUrl));
      if (!currentUrl) {
        return null;
      }

      continue;
    }

    return { response, finalUrl: currentUrl.toString() };
  }

  return null;
}

async function remoteImageIsReachable(url: string): Promise<string | null> {
  try {
    const head = await fetchValidatedRemoteResource(url, { method: "HEAD" });

    if (head?.response.ok) {
      const contentType = head.response.headers.get("content-type");
      if (contentType && contentType.toLowerCase().startsWith("image/")) {
        const lengthHeader = head.response.headers.get("content-length");
        if (!lengthHeader) return head.finalUrl;
        const length = Number(lengthHeader);
        if (!Number.isNaN(length) && length > 0) {
          return head.finalUrl;
        }
      }
    }

    if (head && head.response.status !== 405) {
      return null;
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      return null;
    }
  }

  try {
    const getRes = await fetchValidatedRemoteResource(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });

    if (!getRes?.response.ok) {
      return null;
    }

    const contentType = getRes.response.headers.get("content-type");
    if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
      return null;
    }

    await getRes.response.arrayBuffer().catch(() => undefined);
    return getRes.finalUrl;
  } catch {
    return null;
  }
}

function dataUrlHasPayload(dataUrl: string): boolean {
  if (!DATA_URL_PATTERN.test(dataUrl)) return false;
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return false;
  const payload = dataUrl.slice(commaIndex + 1).trim();
  if (!payload) return false;
  if (BASE64_DATA_URL_PATTERN.test(dataUrl)) {
    return payload.length > 0;
  }
  return payload.length > 0;
}

export async function resolveProfileImage({
  image,
  name,
  seed,
}: {
  image: string;
  name: string;
  seed?: string;
}): Promise<string> {
  if (!image) {
    return generateInitialAvatar({ name, seed });
  }

  if (DATA_URL_PATTERN.test(image)) {
    return dataUrlHasPayload(image) ? image : generateInitialAvatar({ name, seed });
  }

  if (!REMOTE_URL_PATTERN.test(image)) {
    return generateInitialAvatar({ name, seed });
  }

  const reachableUrl = await remoteImageIsReachable(image);
  if (!reachableUrl) {
    return generateInitialAvatar({ name, seed });
  }

  return reachableUrl;
}
