import {
  lexSfml,
  MAX_DIAGNOSTICS,
  type SyntaxErrorItem,
  type Token,
} from "./lexer";

/** Retain only the events needed by warnings instead of a full concrete parse tree. */
export type SfmlEvent =
  | {
      kind: "input" | "output";
      resourceType: string;
      lineStart: number;
      lineEnd: number;
    }
  | { kind: "forget" | "if" | "blockEnd" };
export type SfmlProgram = { events: SfmlEvent[] };
export type ParsedSfmlSyntax = {
  ok: boolean;
  errors: SyntaxErrorItem[];
  tree: SfmlProgram;
};

const identifiers = new Set([
  "identifier",
  "REDSTONE",
  "GLOBAL",
  "SECOND",
  "SECONDS",
  "TOP",
  "BOTTOM",
  "LEFT",
  "RIGHT",
  "FRONT",
  "BACK",
]);
const sides = new Set([
  "TOP",
  "BOTTOM",
  "NORTH",
  "EAST",
  "SOUTH",
  "WEST",
  "LEFT",
  "RIGHT",
  "FRONT",
  "BACK",
  "NULL",
]);
const comparisons = new Set(["GT", "LT", "EQ", "LE", "GE"]);
const setOps = new Set(["OVERALL", "SOME", "EVERY", "EACH", "ONE", "LONE"]);
const units = new Set(["TICKS", "TICK", "SECONDS", "SECOND"]);
const recovery = new Set([
  "INPUT",
  "FROM",
  "OUTPUT",
  "TO",
  "IF",
  "FORGET",
  "ELSE",
  "END",
  "EVERY",
  "eof",
]);
const syntaxFailure = Symbol("syntax failure");

class Parser {
  private index = 0;
  private events: SfmlEvent[] = [];
  constructor(
    private tokens: Token[],
    private errors: SyntaxErrorItem[],
  ) {}
  private get token() {
    return this.tokens[this.index];
  }
  private get kind() {
    return this.token.kind;
  }
  private at(kind: string) {
    return this.kind === kind;
  }
  private take(kind: string): boolean {
    if (!this.at(kind)) return false;
    this.index++;
    return true;
  }
  private fail(expected: string): never {
    const t = this.token;
    if (this.errors.length < MAX_DIAGNOSTICS) {
      const found =
        t.kind === "eof"
          ? "end of script"
          : JSON.stringify(t.text.slice(0, 60));
      this.errors.push({
        lineStart: t.line,
        columnStart: t.column,
        lineEnd: t.lineEnd,
        columnEnd:
          t.lineEnd === t.line
            ? Math.max(t.columnEnd, t.column + 1)
            : t.columnEnd,
        message: `Expected ${expected}, found ${found}.`,
      });
    }
    throw syntaxFailure;
  }
  private expect(kind: string) {
    if (!this.take(kind))
      this.fail(kind === "string" ? "a quoted string" : kind);
  }
  private expectOne(kinds: Set<string>, description: string) {
    if (!kinds.has(this.kind)) this.fail(description);
    this.index++;
  }
  private isResource() {
    return identifiers.has(this.kind) || this.at("string");
  }
  private label() {
    if (!this.isResource()) this.fail("a label");
    this.index++;
  }
  private resource() {
    if (this.take("string")) return;
    this.expectOne(identifiers, "a resource identifier");
    for (let i = 0; i < 3 && this.take(":"); i++) {
      if (identifiers.has(this.kind)) this.index++;
    }
  }
  private resourceList(separator: "," | "OR", booleanContext = false) {
    this.resource();
    while (this.at(separator)) {
      // OR can either separate resource IDs or join two boolean expressions.
      if (booleanContext && this.startsBoolean(this.index + 1)) break;
      this.index++;
      if (!this.isResource()) break; // optional trailing comma/OR
      this.resource();
    }
  }
  private startsBoolean(index: number) {
    const kind = this.tokens[index]?.kind;
    if (["(", "NOT", "TRUE", "FALSE"].includes(kind) || setOps.has(kind))
      return true;
    if (kind === "REDSTONE" && comparisons.has(this.tokens[index + 1]?.kind))
      return true;
    // A label access may have commas, round robin, sides and slots before HAS.
    // Stop at a resource colon or an expression/statement boundary.
    const qualifierTokens = new Set([
      ",",
      "ROUND",
      "ROBIN",
      "BY",
      "LABEL",
      "BLOCK",
      "EACH",
      "SIDE",
      "SLOT",
      "SLOTS",
      "number",
      "-",
      "string",
    ]);
    for (let i = index; i < this.tokens.length; i++) {
      const current = this.tokens[i].kind;
      if (current === "HAS") return true;
      if (
        !identifiers.has(current) &&
        !sides.has(current) &&
        !qualifierTokens.has(current)
      )
        return false;
    }
    return false;
  }
  private tag() {
    if (this.take("TAG")) this.take("#");
    else this.expect("#");
    this.expectOne(identifiers, "a tag identifier");
    if (this.take(":")) this.expectOne(identifiers, "a tag identifier");
    while (this.take("/")) this.expectOne(identifiers, "a tag path");
  }
  private withClause() {
    if (this.take("WITH") || this.take("WITHOUT")) this.expression(true);
  }
  private resourceLimit() {
    let limit = false;
    if (this.take("number")) {
      this.take("EACH");
      limit = true;
    }
    if (this.take("RETAIN")) {
      this.expect("number");
      this.take("EACH");
      limit = true;
    }
    if (this.isResource()) this.resourceList("OR");
    else if (!limit && !this.at("WITH") && !this.at("WITHOUT"))
      this.fail("a resource or quantity");
    this.withClause();
  }
  private resourceLimits() {
    const starts = () =>
      this.isResource() ||
      ["number", "RETAIN", "WITH", "WITHOUT"].includes(this.kind);
    if (!starts()) return;
    this.resourceLimit();
    while (this.take(",")) {
      if (!starts()) break;
      this.resourceLimit();
    }
  }
  private exclusion() {
    if (this.take("EXCEPT")) this.resourceList(",");
  }
  private labelAccess() {
    this.label();
    while (this.take(",")) this.label();
    if (this.take("ROUND")) {
      this.expect("ROBIN");
      this.expect("BY");
      if (!this.take("LABEL")) this.expect("BLOCK");
    }
    if (this.take("EACH")) this.expect("SIDE");
    else if (sides.has(this.kind)) {
      this.index++;
      while (this.take(",")) this.expectOne(sides, "a side");
      this.expect("SIDE");
    }
    if (this.take("SLOTS") || this.take("SLOT")) {
      do {
        this.expect("number");
        if (this.take("-")) this.expect("number");
      } while (this.take(","));
    }
  }
  private destination(output: boolean) {
    if (output && this.take("EMPTY")) {
      if (!this.take("SLOTS")) this.expect("SLOT");
      this.expect("IN");
    }
    this.take("EACH");
    this.labelAccess();
  }
  private io(output: boolean) {
    const start = this.index;
    const action = output ? "OUTPUT" : "INPUT";
    const direction = output ? "TO" : "FROM";
    if (this.take(action)) {
      this.resourceLimits();
      this.exclusion();
      this.expect(direction);
      this.destination(output);
    } else {
      this.expect(direction);
      this.destination(output);
      this.expect(action);
      this.resourceLimits();
      this.exclusion();
    }
    // Preserve existing warning classification, including defaults and aliases.
    let text = "";
    for (let i = start; i < this.index; i++) text += this.tokens[i].text;
    const resourceType =
      text
        .match(/(fe|fluid|gas|item)(?:::[^:]*|:[^:*]*:\*|:[^:*]*)/i)?.[1]
        ?.toLowerCase() ?? "item";
    this.events.push({
      kind: output ? "output" : "input",
      resourceType,
      lineStart: this.tokens[start].line,
      lineEnd: this.tokens[this.index - 1].line,
    });
  }
  private booleanAtom() {
    if (this.take("TRUE") || this.take("FALSE")) return;
    // REDSTONE is also a legal label. HAS or a qualifier makes it a label access.
    const next = this.tokens[this.index + 1]?.kind;
    if (
      this.at("REDSTONE") &&
      next !== "HAS" &&
      next !== "," &&
      next !== "ROUND" &&
      next !== "EACH" &&
      next !== "SLOT" &&
      next !== "SLOTS" &&
      !sides.has(next)
    ) {
      this.index++;
      if (comparisons.has(this.kind)) {
        this.index++;
        this.expect("number");
      }
      return;
    }
    if (setOps.has(this.kind)) this.index++;
    this.labelAccess();
    this.expect("HAS");
    this.expectOne(comparisons, "a comparison operator");
    this.expect("number");
    if (this.isResource()) this.resourceList("OR", true);
    this.withClause();
    this.exclusion();
  }
  private expression(tags: boolean) {
    // Parentheses and unary operators use counters, so nesting cannot exhaust
    // the JavaScript call stack. A WITH expression can end inside a boolean one.
    let depth = 0;
    let needsOperand = true;
    for (;;) {
      if (needsOperand) {
        while (this.take("NOT")) {
          /* unary operators */
        }
        if (this.take("(")) {
          depth++;
          continue;
        }
        if (tags) this.tag();
        else this.booleanAtom();
        needsOperand = false;
      } else if (this.at("AND") || this.at("OR")) {
        if (tags && depth === 0) {
          let next = this.index + 1;
          while (["NOT", "("].includes(this.tokens[next]?.kind)) next++;
          if (!["TAG", "#"].includes(this.tokens[next]?.kind)) return;
        }
        this.index++;
        needsOperand = true;
      } else if (depth > 0) {
        this.expect(")");
        depth--;
      } else return;
    }
  }
  private trigger() {
    this.expect("EVERY");
    if (this.take("REDSTONE")) this.expect("PULSE");
    else {
      if (!this.take("globalNumber")) {
        this.take("number");
        this.take("GLOBAL");
      }
      if (this.take("PLUS")) this.expect("number");
      this.expectOne(units, "TICKS or SECONDS");
    }
    this.expect("DO");
  }
  parse(): ParsedSfmlSyntax {
    const blocks: Array<{ kind: "trigger" | "if"; hasElse: boolean }> = [];
    if (this.take("NAME")) {
      try {
        this.expect("string");
      } catch (e) {
        if (e !== syntaxFailure) throw e;
      }
    }
    while (!this.at("eof") && this.errors.length < MAX_DIAGNOSTICS) {
      const start = this.index;
      try {
        if (!blocks.length) {
          this.trigger();
          blocks.push({ kind: "trigger", hasElse: false });
        } else if (this.take("END")) {
          this.events.push({ kind: "blockEnd" });
          blocks.pop();
        } else if (this.take("ELSE")) {
          const block = blocks[blocks.length - 1];
          if (block.kind !== "if" || block.hasElse) this.fail("END");
          this.events.push({ kind: "blockEnd" });
          if (this.take("IF")) {
            this.expression(false);
            this.expect("THEN");
          } else block.hasElse = true;
        } else if (this.take("IF")) {
          this.expression(false);
          this.expect("THEN");
          this.events.push({ kind: "if" });
          blocks.push({ kind: "if", hasElse: false });
        } else if (this.take("FORGET")) {
          if (this.isResource()) this.label();
          while (this.take(",")) {
            if (!this.isResource()) break;
            this.label();
          }
          this.events.push({ kind: "forget" });
        } else if (this.at("INPUT") || this.at("FROM")) this.io(false);
        else if (this.at("OUTPUT") || this.at("TO")) this.io(true);
        else this.fail("INPUT, OUTPUT, IF, FORGET or END");
      } catch (e) {
        if (e !== syntaxFailure) throw e;
        if (this.index === start && !this.at("eof")) this.index++;
        while (!recovery.has(this.kind)) this.index++;
      }
    }
    if (blocks.length && this.errors.length < MAX_DIAGNOSTICS) {
      try {
        this.fail("END to close the block");
      } catch (e) {
        if (e !== syntaxFailure) throw e;
      }
    }
    return {
      ok: this.errors.length === 0,
      errors: this.errors,
      tree: { events: this.events },
    };
  }
}

export function parseSfml(code: string): ParsedSfmlSyntax {
  const { tokens, errors } = lexSfml(code);
  const parsed = new Parser(tokens, errors).parse();
  parsed.errors.sort(
    (a, b) => a.lineStart - b.lineStart || a.columnStart - b.columnStart,
  );
  return parsed;
}
