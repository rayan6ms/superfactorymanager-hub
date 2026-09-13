import { parseSfml, type SfmlEvent, type SfmlProgram } from "./parser";
import { MAX_DIAGNOSTICS } from "./lexer";

export type WarningItem = {
  message: string;
  lineStart: number;
  lineEnd: number;
};
type Transfer = Extract<SfmlEvent, { kind: "input" | "output" }>;

export function collectWarningsFromTree(tree: SfmlProgram): WarningItem[] {
  let inputs: Transfer[] = [];
  let outputs: Transfer[] = [];
  let inConditional = false;
  const warnings: WarningItem[] = [];

  function verify() {
    const inputTypes = new Set(inputs.map((i) => i.resourceType));
    const outputTypes = new Set(outputs.map((o) => o.resourceType));
    for (const [transfers, counterparts, label] of [
      [inputs, outputTypes, "Input"],
      [outputs, inputTypes, "Output"],
    ] as const) {
      for (const transfer of transfers) {
        if (warnings.length >= MAX_DIAGNOSTICS) break;
        if (!counterparts.has(transfer.resourceType)) {
          warnings.push({
            message: `Warning: ${label} ${transfer.resourceType}:: without corresponding ${label === "Input" ? "output" : "input"}.`,
            lineStart: transfer.lineStart,
            lineEnd: transfer.lineEnd,
          });
        }
      }
    }
    inputs = [];
    outputs = [];
  }

  for (const event of tree.events) {
    switch (event.kind) {
      case "input":
        inputs.push(event);
        break;
      case "output":
        outputs.push(event);
        break;
      case "if":
        inConditional = true;
        break;
      case "forget":
        verify();
        break;
      case "blockEnd":
        // Match the previous linter's branch handling; warnings are advisory.
        if (inConditional) inConditional = false;
        else verify();
        break;
    }
  }
  verify();
  return warnings;
}

export function collectWarnings(code: string): WarningItem[] {
  const parsed = parseSfml(code);
  return parsed.ok ? collectWarningsFromTree(parsed.tree) : [];
}
