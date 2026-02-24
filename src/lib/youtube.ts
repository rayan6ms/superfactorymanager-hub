const ID_MATCHER = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([^"&?/\s]{11})/i;

export type YoutubeAnalysis =
  | { ok: true; id: string }
  | { ok: false; message: string };

function isAllowedHost(hostname: string, domain: string) {
  const host = hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

export function analyzeYoutubeUrl(input: string): YoutubeAnalysis {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, message: "Paste a YouTube link to embed a video." };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, message: "Enter a full YouTube URL starting with https://." };
  }

  const host = parsed.hostname.toLowerCase();
  const isYoutubeHost = host === "youtu.be" || isAllowedHost(host, "youtube.com");
  if (!isYoutubeHost) {
    return { ok: false, message: "Use a youtube.com or youtu.be link." };
  }

  const match = raw.match(ID_MATCHER);
  if (match?.[1]) {
    return { ok: true, id: match[1] };
  }

  if (host === "youtu.be") {
    return { ok: false, message: "Short links should look like https://youtu.be/VIDEO_ID." };
  }

  if (parsed.pathname.includes("/shorts/")) {
    return { ok: false, message: "Shorts links must include the 11-character video ID." };
  }

  if (parsed.pathname.includes("/live/")) {
    return { ok: false, message: "Live links need the video ID at the end of the URL." };
  }

  return { ok: false, message: "Include the video ID (v=VIDEO_ID or /embed/VIDEO_ID) in the link." };
}

export function toEmbed(url: string): string | null {
  const analysis = analyzeYoutubeUrl(url);
  return analysis.ok ? `https://www.youtube.com/embed/${analysis.id}` : null;
}
