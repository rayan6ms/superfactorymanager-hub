export function getBaseUrl(defaultBase = "https://sfmhub.vercel.app") {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  if (process.env.VERCEL_ENV !== "production") {
    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) {
      const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
      return withProtocol.replace(/\/$/, "");
    }
  }

  return defaultBase.replace(/\/$/, "");
}