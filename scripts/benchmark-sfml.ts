import { analyzeSfmlCode } from "../src/lib/sfml/analysis";

// Valid workloads only: no early failure or diagnostic limit can skip the input.
for (const transfers of [2_500, 10_000, 20_000]) {
  const code = `EVERY 20 TICKS DO\n${" INPUT FROM chest\n OUTPUT TO furnace\n".repeat(transfers)}END`;
  analyzeSfmlCode(code);
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const result = analyzeSfmlCode(code);
    samples.push(performance.now() - start);
    if (result.status !== "ok" || result.warnings.length)
      throw new Error("Benchmark program did not validate");
  }
  samples.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      bytes: code.length,
      statements: transfers * 2,
      medianMs: Number(samples[2].toFixed(2)),
    }),
  );
}
