#!/usr/bin/env node
/**
 * Verify that the version in `package.json` matches the one in
 * `openclaw.plugin.json`. These two files are the source of truth for the
 * npm tarball and the OpenClaw manifest respectively; drifting them silently
 * leads to confusing "installed version says X but plugin reports Y" states.
 *
 * Run via `npm run version-check`. Exits non-zero on mismatch.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(rel) {
  const p = resolve(root, rel);
  return JSON.parse(readFileSync(p, "utf-8"));
}

const pkgVersion = readJson("package.json").version;
const manifestVersion = readJson("openclaw.plugin.json").version;

if (pkgVersion !== manifestVersion) {
  console.error(
    `[check-version] version mismatch: package.json=${pkgVersion}, openclaw.plugin.json=${manifestVersion}. ` +
      `Update both to the same value before releasing.`,
  );
  process.exit(1);
}

console.log(`[check-version] versions in sync: ${pkgVersion}`);
