export function normalizePostDescription(value: string): string {
  const normalizedLineEndings = value.replace(/\r\n?/g, "\n");
  const lines = normalizedLineEndings
    .split("\n")
    .map(line => line.replace(/[ \t]+$/g, ""))
    .filter(line => line.trim().length > 0);

  return lines.join("\n").trim();
}
