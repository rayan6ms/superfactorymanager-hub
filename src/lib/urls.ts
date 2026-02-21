export function getBaseUrl(defaultBase = "https://sfmhub.site") {
  const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  const vercelUrl = process.env.VERCEL_URL;
  const vercelEnv = process.env.VERCEL_ENV;

  if (vercelEnv === "production") {
    return trimTrailingSlash(appUrl || defaultBase);
  }

  if (vercelEnv === "preview" && vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return trimTrailingSlash(withProtocol);
  }

  if (appUrl) return trimTrailingSlash(appUrl);

  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return trimTrailingSlash(withProtocol);
  }

  return trimTrailingSlash(defaultBase);
}
