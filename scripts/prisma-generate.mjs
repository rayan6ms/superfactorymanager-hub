#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const useNoEngine = process.env.VERCEL === "1" || process.env.PRISMA_GENERATE_NO_ENGINE === "1";
const args = ["prisma", "generate"];

if (useNoEngine) {
  args.push("--no-engine");
}

const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
