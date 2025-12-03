export function getBaseUrl(defaultBase = "https://superfactorymanager.vercel.app") {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) {
    const withProtocol = vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
    return withProtocol.replace(/\/$/, "");
  }

  return defaultBase.replace(/\/$/, "");
}
