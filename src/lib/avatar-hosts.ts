const ALLOWED_AVATAR_HOSTNAME_PATTERNS = [
  "avatars.githubusercontent.com",
  "lh3.googleusercontent.com",
  "*.googleusercontent.com",
  "*.public.blob.vercel-storage.com",
] as const;

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function matchesHostnamePattern(hostname: string, pattern: string) {
  if (!pattern.startsWith("*.")) {
    return hostname === pattern;
  }

  const suffix = pattern.slice(2);
  return hostname.endsWith(`.${suffix}`);
}

export const avatarImageRemotePatterns = ALLOWED_AVATAR_HOSTNAME_PATTERNS.map((hostname) => ({
  protocol: "https" as const,
  hostname,
}));

export const avatarImageCspSources = ALLOWED_AVATAR_HOSTNAME_PATTERNS.map((hostname) => `https://${hostname}`);

export const supportedAvatarHostLabels = [
  "avatars.githubusercontent.com",
  "*.googleusercontent.com",
  "*.public.blob.vercel-storage.com",
] as const;

export function isAllowedAvatarRemoteUrl(url: string | URL) {
  let parsed: URL;
  try {
    parsed = url instanceof URL ? new URL(url.toString()) : new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const hostname = normalizeHostname(parsed.hostname);
  return ALLOWED_AVATAR_HOSTNAME_PATTERNS.some((pattern) => matchesHostnamePattern(hostname, pattern));
}
