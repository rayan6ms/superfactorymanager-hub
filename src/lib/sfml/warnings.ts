import { CharStreams, CommonTokenStream } from "antlr4ts";
import type { ParserRuleContext } from "antlr4ts";
import type { ErrorNode } from "antlr4ts/tree/ErrorNode";
import { ParseTreeWalker } from "antlr4ts/tree/ParseTreeWalker";
import type { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { SFMLLexer } from "@/generated/SFMLLexer";
import { SFMLParser, BlockContext, ForgetStatementContext, IfStatementContext, InputStatementContext, OutputStatementContext } from "@/generated/SFMLParser";
import { SFMLListener } from "@/generated/SFMLListener";

export type WarningItem = { message: string; lineStart: number; lineEnd: number };

class InputOutputChecker implements SFMLListener {
  private inputs: Array<{ type: string; lineStart: number; lineEnd: number }> = [];
  private outputs: Array<{ type: string; lineStart: number; lineEnd: number }> = [];
  private onIfElseStatement = false;
  public warnings: WarningItem[] = [];

  private addWarning(msg: string, lineStart: number, lineEnd: number) {
    this.warnings.push({ message: msg, lineStart, lineEnd });
  }

  private typeFromCtxText(text: string): string {
    let t = text.match(/(fe|fluid|gas|item)(?:::[^:]*|:[^:*]*:\*|:[^:*]*)/i)?.[1]?.toLowerCase();
    if (!t || !text.includes(":")) t = "item";
    if (t.startsWith("fluid:")) t = "fluid";
    if (t.startsWith("fe:")) t = "fe";
    if (t.startsWith("gas:")) t = "gas";
    if (t.startsWith("item:")) t = "item";
    return t;
  }

  enterInputStatement(ctx: InputStatementContext) {
    const type = this.typeFromCtxText(ctx.text);
    this.inputs.push({ type, lineStart: ctx.start.line, lineEnd: ctx.stop?.line ?? ctx.start.line });
  }

  enterOutputStatement(ctx: OutputStatementContext) {
    const type = this.typeFromCtxText(ctx.text);
    this.outputs.push({ type, lineStart: ctx.start.line, lineEnd: ctx.stop?.line ?? ctx.start.line });
  }

  private verify() {
    for (const i of this.inputs) {
      if (!this.outputs.some(o => o.type === i.type)) {
        this.addWarning(`Warning: Input ${i.type}:: without corresponding output.`, i.lineStart, i.lineEnd);
      }
    }
    for (const o of this.outputs) {
      if (!this.inputs.some(i => i.type === o.type)) {
        this.addWarning(`Warning: Output ${o.type}:: without corresponding input.`, o.lineStart, o.lineEnd);
      }
    }
  }

  enterForgetStatement(_ctx: ForgetStatementContext) {
    void _ctx;
    this.verify();
    this.inputs = [];
    this.outputs = [];
  }

  exitBlock(_ctx: BlockContext) {
    void _ctx;
    if (this.onIfElseStatement) { this.onIfElseStatement = false; return; }
    this.verify();
    this.inputs = [];
    this.outputs = [];
  }

  enterIfStatement(_ctx: IfStatementContext) { void _ctx; this.onIfElseStatement = true; }

  finalCheck() {
    this.verify();
    this.inputs = [];
    this.outputs = [];
  }

  enterEveryRule?(_ctx: ParserRuleContext): void { void _ctx; }
  exitEveryRule?(_ctx: ParserRuleContext): void { void _ctx; }
  visitTerminal?(_node: TerminalNode): void { void _node; }
  visitErrorNode?(_node: ErrorNode): void { void _node; }
}

export function collectWarningsFromTree(tree: ParserRuleContext): WarningItem[] {
  const checker = new InputOutputChecker();
  const walker = new ParseTreeWalker();
  walker.walk(checker as SFMLListener, tree);
  checker.finalCheck();

  return checker.warnings;
}

export function collectWarnings(code: string): WarningItem[] {
  const input = CharStreams.fromString(code);
  const lexer = new SFMLLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new SFMLParser(tokens);
  const tree = parser.program();
  return collectWarningsFromTree(tree);
}
