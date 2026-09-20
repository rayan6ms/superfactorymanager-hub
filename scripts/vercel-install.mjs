#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

// Vercel's bundled Bun cannot read our lockfile, and its bunx bootstrap exits
// before launching the requested version. Download the official binary directly.
const version = "1.4.2";
const url = `https://registry.npmjs.org/@oven/bun-linux-x64/-/bun-linux-x64-${version}.tgz`;
const integrity =
  "9/E/UXOTpSo3YsV5g+FhtTd/qTpiWoKuxS12cqtuYA1ssu9fRAoPQnipFgGyck3tWO63iUdxBiygq+kELFawng==";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.signal ?? result.status})`);
  }
}

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("This installer targets Vercel Linux x64 builds. Use bun install locally.");
}

const directory = await mkdtemp(join(tmpdir(), "sfmhub-bun-"));
try {
  console.log(`Downloading Bun ${version} for Vercel…`);
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Bun download failed: HTTP ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash("sha512").update(archive).digest("base64") !== integrity) {
    throw new Error("Bun archive integrity check failed");
  }
  const archivePath = join(directory, "bun.tgz");
  await writeFile(archivePath, archive);
  run("tar", ["-xzf", archivePath, "-C", directory]);
  const binDirectory = join(directory, "package", "bin");
  const bun = join(binDirectory, "bun");
  console.log("Verified Bun version:");
  run(bun, ["--version"]);
  console.log("Installing dependencies from bun.lock…");
  run(bun, ["install", "--frozen-lockfile"], {
    env: { ...process.env, PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}` },
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
