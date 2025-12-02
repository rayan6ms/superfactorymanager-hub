import crypto from "crypto";

const DATA_URL_PATTERN = /^data:image\//i;
const BASE64_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const REMOTE_URL_PATTERN = /^https?:\/\//i;
const REMOTE_TIMEOUT_MS = 5000;

const BLOCKED_HOSTNAMES = ["localhost"];
const BLOCKED_IPV6_HOSTS = ["::1"];

const BLOCKED_IPV4_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^169\.254\./,
];

const BLOCKED_IPV6_PATTERNS = [
  /^::1$/i,
  /^fe80:/i,
  /^fc00:/i,
  /^fd00:/i,
];

function isPrivateOrLocalAddress(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.includes(lower)) return true;
  if (BLOCKED_IPV6_HOSTS.includes(lower)) return true;

  if (BLOCKED_IPV4_PATTERNS.some(rx => rx.test(lower))) return true;
  if (BLOCKED_IPV6_PATTERNS.some(rx => rx.test(lower))) return true;

  return false;
}

function isSafeRemoteUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (isPrivateOrLocalAddress(parsed.hostname)) {
    return false;
  }

  return true;
}

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

async function remoteImageIsReachable(url: string): Promise<boolean> {
  try {
    const head = await fetchWithTimeout(url, {
      method: "HEAD",
      redirect: "follow",
      cache: "no-store",
    });

    if (head.ok) {
      const contentType = head.headers.get("content-type");
      if (contentType && contentType.toLowerCase().startsWith("image/")) {
        const lengthHeader = head.headers.get("content-length");
        if (!lengthHeader) return true;
        const length = Number(lengthHeader);
        if (Number.isNaN(length) || length > 0) return true;
      }
    }

    if (head.status !== 405) {
      return false;
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      return false;
    }
  }

  try {
    const getRes = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store",
    });

    if (!getRes.ok) {
      return false;
    }

    const contentType = getRes.headers.get("content-type");
    if (!contentType || !contentType.toLowerCase().startsWith("image/")) {
      return false;
    }

    await getRes.arrayBuffer().catch(() => undefined);
    return true;
  } catch {
    return false;
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

  if (!REMOTE_URL_PATTERN.test(image) || !isSafeRemoteUrl(image)) {
    return generateInitialAvatar({ name, seed });
  }

  const reachable = await remoteImageIsReachable(image);
  if (!reachable) {
    return generateInitialAvatar({ name, seed });
  }

  return image;
}
