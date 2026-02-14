import { NextResponse } from "next/server";
import { analyzeYoutubeUrl } from "@/lib/youtube";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const analysis = analyzeYoutubeUrl(target);
  if (!analysis.ok) {
    return NextResponse.json({ error: analysis.message }, { status: 400 });
  }

  const watchUrl = `https://www.youtube.com/watch?v=${analysis.id}`;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    watchUrl
  )}&format=json`;

  try {
    const res = await fetch(oembedUrl, { cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not load video details from YouTube." },
        { status: 502 }
      );
    }

    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };

    return NextResponse.json({
      id: analysis.id,
      title: data.title ?? "Unknown video",
      author: data.author_name ?? "YouTube",
      thumbnail: data.thumbnail_url ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach YouTube." }, { status: 502 });
  }
}