export function toEmbed(url: string): string | null {
  if (!url) return null;
  const r = /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;
  const m = url.match(r);
  return m?.[1] ? `https://www.youtube.com/embed/${m[1]}` : null;
}
