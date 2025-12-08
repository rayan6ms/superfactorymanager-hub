import { NextResponse } from "next/server";

function getPublisherId() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT || process.env.GOOGLE_ADSENSE_PUBLISHER_ID;
  if (!clientId) return null;

  const sanitized = clientId.replace(/^ca-/, "");
  return sanitized.startsWith("pub-") ? sanitized : `pub-${sanitized}`;
}

export function GET() {
  const publisherId = getPublisherId();
  const lines = ["# ads.txt for SFMHub"];

  if (publisherId) {
    lines.push(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0`);
  } else {
    lines.push("# Set NEXT_PUBLIC_GOOGLE_ADS_CLIENT or GOOGLE_ADSENSE_PUBLISHER_ID to publish your ads entry.");
  }

  return new NextResponse(`${lines.join("\n")}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
