/** SFML locations use one-based lines and zero-based UTF-16 columns, like Monaco. */
export type SyntaxErrorItem = {
  lineStart: number;
  columnStart: number;
  lineEnd: number;
  columnEnd: number;
  message: string;
};

export type Token = {
  kind: string;
  text: string;
  start: number;
  end: number;
  line: number;
  column: number;
  lineEnd: number;
  columnEnd: number;
};

export const MAX_DIAGNOSTICS = 100;
const keywords = new Set(
  `IF THEN ELSE HAS OVERALL SOME ONE LONE TRUE FALSE NOT AND OR
GT LT EQ LE GE FROM TO INPUT OUTPUT WHERE SLOTS SLOT RETAIN EACH EXCEPT FORGET EMPTY IN
WITHOUT WITH TAG ROUND ROBIN BY LABEL BLOCK TOP BOTTOM NORTH EAST SOUTH WEST SIDE LEFT
RIGHT FRONT BACK NULL TICKS TICK SECONDS SECOND GLOBAL PLUS REDSTONE PULSE DO END NAME EVERY`.split(
    /\s+/,
  ),
);
const punctuation: Record<string, string> = {
  ">": "GT",
  "<": "LT",
  "=": "EQ",
  "<=": "LE",
  ">=": "GE",
  "+": "PLUS",
  "#": "#",
  ",": ",",
  ":": ":",
  "/": "/",
  "-": "-",
  "(": "(",
  ")": ")",
};
const isDigit = (c: number) => c >= 48 && c <= 57;
const isIdentifierStart = (c: number) =>
  (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 42;

export function lexSfml(code: string): {
  tokens: Token[];
  errors: SyntaxErrorItem[];
} {
  const tokens: Token[] = [];
  const errors: SyntaxErrorItem[] = [];
  let offset = 0;
  let line = 1;
  let column = 0;

  while (offset < code.length) {
    const start = offset;
    const lineStart = line;
    const columnStart = column;
    const c = code.charCodeAt(offset);
    if (c === 32 || c === 9 || c === 13 || c === 10) {
      offset++;
      if (c === 10) {
        line++;
        column = 0;
      } else {
        column++;
      }
      continue;
    }
    if (code.startsWith("--", offset)) {
      while (offset < code.length && code[offset] !== "\r" && code[offset] !== "\n") offset++;
      column += offset - start;
      continue;
    }

    let kind: string;
    if (c === 34) {
      // Legacy SFML strings allow newlines and literal backslashes. A quote
      // following a backslash is part of the string if a later quote can close it.
      let closing = -1;
      offset++;
      while (offset < code.length) {
        if (code[offset] === '"') {
          closing = offset;
          if (code[offset - 1] !== "\\") break;
        }
        offset++;
      }
      if (closing < 0) {
        kind = "invalid";
      } else {
        offset = closing + 1;
        kind = "string";
      }
      for (let i = start; i < offset; i++) {
        if (code[i] === "\n") {
          line++;
          column = 0;
        } else {
          column++;
        }
      }
      if (kind === "invalid" && errors.length < MAX_DIAGNOSTICS) {
        errors.push({
          lineStart,
          columnStart,
          lineEnd: line,
          columnEnd: column,
          message: "Unterminated string; expected a closing quote.",
        });
      }
    } else {
      if (isDigit(c)) {
        while (isDigit(code.charCodeAt(offset))) offset++;
        kind = "number";
        if (code[offset] === "g" || code[offset] === "G") {
          offset++;
          kind = "globalNumber";
        }
      } else if (isIdentifierStart(c)) {
        offset++;
        while (isIdentifierStart(code.charCodeAt(offset)) || isDigit(code.charCodeAt(offset)))
          offset++;
        const word = code.slice(start, offset).toUpperCase();
        kind = word === "G" ? "GLOBAL" : keywords.has(word) ? word : "identifier";
      } else {
        const pair = code.slice(offset, offset + 2);
        kind = punctuation[pair] ?? punctuation[code[offset]] ?? "invalid";
        offset += punctuation[pair] ? 2 : code.codePointAt(offset)! > 0xffff ? 2 : 1;
      }
      column += offset - start;
      if (kind === "invalid" && errors.length < MAX_DIAGNOSTICS) {
        errors.push({
          lineStart,
          columnStart,
          lineEnd: line,
          columnEnd: column,
          message: `Unexpected character ${JSON.stringify(code.slice(start, offset))}.`,
        });
      }
    }
    tokens.push({
      kind,
      text: code.slice(start, offset),
      start,
      end: offset,
      line: lineStart,
      column: columnStart,
      lineEnd: line,
      columnEnd: column,
    });
  }
  tokens.push({
    kind: "eof",
    text: "",
    start: offset,
    end: offset,
    line,
    column,
    lineEnd: line,
    columnEnd: column,
  });
  return { tokens, errors };
}
