import crypto from "crypto";

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
