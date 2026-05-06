import "server-only";

import crypto from "crypto";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import sharp from "sharp";
import { isAllowedAvatarRemoteUrl } from "./avatar-hosts";
import { uploadImageVariant } from "./blob";

const DATA_URL_PATTERN = /^data:image\//i;
const BASE64_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const REMOTE_URL_PATTERN = /^https?:\/\//i;
const REMOTE_TIMEOUT_MS = 5000;
const MAX_REMOTE_REDIRECTS = 3;
const MAX_REMOTE_AVATAR_BYTES = 8 * 1024 * 1024;
const MAX_REMOTE_AVATAR_PIXELS = 24_000_000;

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

type ValidatedRemoteUrl = {
  url: URL;
  addresses: string[];
};

async function validateRemoteUrl(url: string | URL): Promise<ValidatedRemoteUrl | null> {
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
    return { url: parsed, addresses: [hostname] };
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

  return { url: parsed, addresses };
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

type RemoteFetchResult = {
  response: {
    status: number;
    ok: boolean;
    headers: Headers;
  };
  finalUrl: string;
};

function createAbortError(message: string) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function getHostHeader(url: URL): string {
  const hostname = net.isIP(url.hostname) === 6 ? `[${url.hostname}]` : url.hostname;
  const defaultPort = url.protocol === "https:" ? "443" : "80";

  if (!url.port || url.port === defaultPort) {
    return hostname;
  }

  return `${hostname}:${url.port}`;
}

function toOutgoingHeaders(url: URL, headersInit?: HeadersInit): http.OutgoingHttpHeaders {
  const headers = new Headers(headersInit);
  headers.set("accept", headers.get("accept") ?? "image/*");
  headers.set("connection", "close");
  headers.set("host", getHostHeader(url));

  return Object.fromEntries(headers.entries());
}

function requestPinnedRemoteHeaders(
  url: URL,
  address: string,
  init: RequestInit,
): Promise<RemoteFetchResult["response"]> {
  const method = init.method ?? "GET";
  const path = `${url.pathname}${url.search}`;
  const baseOptions = {
    family: net.isIP(address) || undefined,
    headers: toOutgoingHeaders(url, init.headers),
    hostname: address,
    method,
    path,
    port: url.port ? Number(url.port) : undefined,
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let request: http.ClientRequest | null = null;
    const timer = setTimeout(() => {
      const abortError = createAbortError("Remote image request timed out.");
      if (settled) return;
      settled = true;
      request?.destroy(abortError);
      reject(abortError);
    }, REMOTE_TIMEOUT_MS);

    const handleResponse = (response: http.IncomingMessage) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) {
          headers.set(key, value.join(", "));
        } else if (typeof value === "string") {
          headers.set(key, value);
        }
      }

      if (settled) {
        response.destroy();
        return;
      }

      settled = true;
      clearTimeout(timer);
      response.destroy();
      const status = response.statusCode ?? 0;
      resolve({
        status,
        ok: status >= 200 && status < 300,
        headers,
      });
    };

    try {
      request = url.protocol === "https:"
        ? https.request(
          {
            ...baseOptions,
            servername: net.isIP(url.hostname) ? undefined : url.hostname,
          },
          handleResponse,
        )
        : http.request(baseOptions, handleResponse);
    } catch (error) {
      settled = true;
      clearTimeout(timer);
      reject(error);
      return;
    }

    request.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    request.end();
  });
}

async function fetchPinnedRemoteResponse(
  target: ValidatedRemoteUrl,
  init: RequestInit,
): Promise<RemoteFetchResult["response"] | null> {
  let lastError: unknown = null;

  for (const address of target.addresses) {
    try {
      return await requestPinnedRemoteHeaders(target.url, address, init);
    } catch (error) {
      lastError = error;
      if ((error as Error).name === "AbortError") {
        throw error;
      }
    }
  }

  if (lastError) {
    return null;
  }

  return null;
}

async function fetchValidatedRemoteResource(
  inputUrl: string,
  init: RequestInit,
): Promise<RemoteFetchResult | null> {
  let currentUrl = await validateRemoteUrl(inputUrl);
  if (!currentUrl || !isAllowedAvatarRemoteUrl(currentUrl.url)) {
    return null;
  }

  for (let redirectCount = 0; redirectCount <= MAX_REMOTE_REDIRECTS; redirectCount += 1) {
    const response = await fetchPinnedRemoteResponse(currentUrl, init);
    if (!response) {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === MAX_REMOTE_REDIRECTS) {
        return null;
      }

      const location = response.headers.get("location");
      if (!location) {
        return null;
      }

      currentUrl = await validateRemoteUrl(new URL(location, currentUrl.url));
      if (!currentUrl || !isAllowedAvatarRemoteUrl(currentUrl.url)) {
        return null;
      }

      continue;
    }

    return { response, finalUrl: currentUrl.url.toString() };
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

    return getRes.finalUrl;
  } catch {
    return null;
  }
}

async function storeRemoteAvatarAsWebp(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { accept: "image/*" },
    redirect: "error",
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("image/")) return null;

  const contentLength = Number(response.headers.get("content-length"));
  if (!Number.isNaN(contentLength) && contentLength > MAX_REMOTE_AVATAR_BYTES) return null;

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_REMOTE_AVATAR_BYTES) return null;

  const avatarBuffer = await sharp(bytes, { limitInputPixels: MAX_REMOTE_AVATAR_PIXELS })
    .rotate()
    .webp({ lossless: true })
    .toBuffer();

  return uploadImageVariant("avatars", avatarBuffer, "image/webp", ".webp");
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

  if (!isAllowedAvatarRemoteUrl(image)) {
    return generateInitialAvatar({ name, seed });
  }

  const reachableUrl = await remoteImageIsReachable(image);
  if (!reachableUrl) {
    return generateInitialAvatar({ name, seed });
  }

  try {
    return await storeRemoteAvatarAsWebp(reachableUrl) ?? reachableUrl;
  } catch (error) {
    console.warn("Failed to store remote avatar as WEBP", { error });
    return reachableUrl;
  }
}
