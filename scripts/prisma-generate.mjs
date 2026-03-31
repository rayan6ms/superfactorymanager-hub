#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const args = ["prisma", "generate"];

const result = spawnSync("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
