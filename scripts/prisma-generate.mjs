#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Execute the installed CLI without downloading packages during a build.
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "generate"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) console.error(result.error.message);
if (result.status !== 0) process.exit(result.status ?? 1);
