import { describe, expect, test } from "bun:test";
import { analyzeSfmlCode } from "../../src/lib/sfml/analysis";
import { lexSfml, MAX_DIAGNOSTICS } from "../../src/lib/sfml/lexer";
import { validateSyntax } from "../../src/lib/sfml/syntax";
import grammarBaseline from "./fixtures/grammar-baseline.json";
import guideBaseline from "./fixtures/guide-baseline.json";

// Captured from the previously deployed ANTLR parser, not the implementation under test.
describe("legacy SFML compatibility", () => {
  test.each(grammarBaseline)("$code", ({ code, status, warnings }) => {
    const result = analyzeSfmlCode(code);
    expect<string>(result.status).toBe(status);
    expect(result.warnings).toEqual(warnings);
  });

  test.each(guideBaseline)("guide: $path", async ({ path, status, warnings }) => {
    const result = analyzeSfmlCode(await Bun.file(path).text());
    expect<string>(result.status).toBe(status);
    expect(result.warnings).toEqual(warnings);
  });
});

const wrap = (body: string) => `EVERY 20 TICKS DO\n${body}\nEND`;
describe("SFML diagnostics and large inputs", () => {
  test.each([
    "INPUT WITH TRUE FROM a",
    "INPUT WITH foo FROM a",
    "INPUT WITH #a AND FALSE FROM a",
    "INPUT WITH #a AND (a HAS > 2) FROM a",
    "INPUT FROM a,",
    "INPUT FROM a SLOTS 0,",
    "IF TRUE THEN ELSE ELSE END",
    "ELSE INPUT FROM a",
    "INPUT EXCEPT dirt,, FROM a",
    "INPUT WITH #a:b:c FROM a",
    "OUTPUT EMPTY SLOTS IN a",
    "IF TRUE THEN",
  ])("rejects malformed input: %s", (code) => {
    expect(validateSyntax(wrap(code)).ok).toBe(false);
  });

  test("bounds malformed diagnostics without dropping valid large programs", () => {
    const code = wrap("  INPUT FROM chest\n  OUTPUT TO furnace\n".repeat(20_000));
    expect(analyzeSfmlCode(code)).toEqual({
      status: "ok",
      message: null,
      syntaxErrors: [],
      warnings: [],
    });
    const bad = validateSyntax(wrap("@ INPUT FROM\n".repeat(20_000)));
    expect(bad.ok).toBe(false);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.errors.length).toBeLessThanOrEqual(MAX_DIAGNOSTICS);
  });

  test("deep expressions and blocks do not exhaust the call stack", () => {
    expect(
      validateSyntax(
        wrap(`IF ${"(".repeat(10_000)}${"NOT ".repeat(10_000)}TRUE${")".repeat(10_000)} THEN END`),
      ).ok,
    ).toBe(true);
    expect(
      validateSyntax(wrap(`${"IF TRUE THEN\n".repeat(10_000)}${"END\n".repeat(10_000)}`)).ok,
    ).toBe(true);
    expect(
      validateSyntax(
        wrap(`INPUT WITH ${"(".repeat(10_000)}#forge:ingots${")".repeat(10_000)} FROM a`),
      ).ok,
    ).toBe(true);
  });

  test("preserves leading whitespace, CRLF, and UTF-16 source positions", () => {
    const result = analyzeSfmlCode("\r\n\tEVERY 20 TICKS DO\r\n  INPUT FROM 😀\r\nEND");
    expect(result.syntaxErrors[0]).toMatchObject({
      lineStart: 3,
      columnStart: 13,
      lineEnd: 3,
      columnEnd: 15,
    });
    const token = lexSfml('NAME "😀"\nEVERY TICKS DO END').tokens[1];
    expect(token).toMatchObject({
      kind: "string",
      start: 5,
      end: 9,
      column: 5,
      columnEnd: 9,
    });
    const warning = analyzeSfmlCode("\n\nEVERY TICKS DO\n INPUT FROM a\nEND").warnings[0];
    expect(warning).toMatchObject({ lineStart: 4, lineEnd: 4 });
  });

  test("warnings reset on FORGET and stay bounded", () => {
    const result = analyzeSfmlCode(wrap("INPUT fluid:: FROM a\nFORGET\nOUTPUT fluid:: TO b"));
    expect(result.warnings.map((w) => w.message)).toEqual([
      "Warning: Input fluid:: without corresponding output.",
      "Warning: Output fluid:: without corresponding input.",
    ]);
    const warnings = analyzeSfmlCode(wrap("INPUT FROM a\n".repeat(10_000))).warnings;
    expect(warnings).toHaveLength(MAX_DIAGNOSTICS);
  });

  test("keeps required, length, and control-character validation", () => {
    expect(analyzeSfmlCode(" \n").status).toBe("idle");
    expect(analyzeSfmlCode(" ", { required: true, emptyMessage: "Paste code" }).message).toBe(
      "Paste code",
    );
    expect(analyzeSfmlCode("ab").status).toBe("error");
    expect(analyzeSfmlCode(wrap("INPUT FROM a\u0000")).message).toBe(
      "Code contains invalid control characters.",
    );
  });
});
