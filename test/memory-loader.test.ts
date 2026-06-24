/**
 * Unit tests for `loadMemoryFiles`. Each test creates a fresh temp directory
 * with synthetic memory files and verifies the scan / sort / truncate / read
 * behavior against expected outcomes.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadMemoryFiles, buildContextBlock } from "../src/memory-loader.js";
import { resolveConfig } from "../src/config.js";

let workspaceDir: string;
let memoryDir: string;

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "memory-inject-"));
  memoryDir = join(workspaceDir, "memory");
  await mkdir(memoryDir, { recursive: true });
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

async function clearMemoryDir(): Promise<void> {
  const entries = await readdir(memoryDir).catch(() => [] as string[]);
  for (const e of entries) {
    await unlink(join(memoryDir, e)).catch(() => {});
  }
}

const NOW_MS = new Date("2026-06-23T12:00:00Z").getTime();
const TODAY_LOCAL = new Date(NOW_MS).toISOString().slice(0, 10);

async function writeMemoryFile(name: string, content: string, mtimeIso: string): Promise<void> {
  const path = join(memoryDir, name);
  await writeFile(path, content, "utf-8");
  const mtime = new Date(mtimeIso).getTime() / 1000;
  const atime = mtime;
  await utimes(path, atime, mtime);
}

describe("loadMemoryFiles", () => {
  it("returns empty result for missing memory dir", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "missing-"));
    const result = await loadMemoryFiles({
      workspaceDir: fresh,
      config: resolveConfig({}),
      nowMs: NOW_MS,
    });
    assert.deepEqual(result.files, []);
    assert.equal(result.totalChars, 0);
    await rm(fresh, { recursive: true, force: true });
  });

  it("ignores files that do not match the filename pattern", async () => {
    await writeMemoryFile("random-notes.md", "ignore me", `${TODAY_LOCAL}T08:00:00Z`);
    await writeMemoryFile("2026-06-23.md", "match me", `${TODAY_LOCAL}T08:00:00Z`);
    const result = await loadMemoryFiles({
      workspaceDir,
      config: resolveConfig({}),
      nowMs: NOW_MS,
    });
    const basenames = result.files.map((f) => f.basename);
    assert.ok(basenames.includes("2026-06-23.md"));
    assert.ok(!basenames.includes("random-notes.md"));
  });

  it("matches YYYY-MM-DD-slug.md files via default pattern", async () => {
    await writeMemoryFile("2026-06-23-1253.md", "sluggish", `${TODAY_LOCAL}T08:00:00Z`);
    const result = await loadMemoryFiles({
      workspaceDir,
      config: resolveConfig({}),
      nowMs: NOW_MS,
    });
    const basenames = result.files.map((f) => f.basename);
    assert.ok(basenames.includes("2026-06-23-1253.md"));
  });

  it("skips files older than the configured daysToLoad window", async () => {
    await writeMemoryFile("2026-06-20.md", "old content", "2026-06-20T08:00:00Z");
    await writeMemoryFile("2026-06-23.md", "fresh", `${TODAY_LOCAL}T08:00:00Z`);
    const result = await loadMemoryFiles({
      workspaceDir,
      config: resolveConfig({ daysToLoad: 2 }),
      nowMs: NOW_MS,
    });
    const basenames = result.files.map((f) => f.basename);
    assert.ok(!basenames.includes("2026-06-20.md"));
    assert.ok(basenames.includes("2026-06-23.md"));
  });

  it("sorts newest first and respects maxFiles truncation", async () => {
    const a = `${TODAY_LOCAL}T07:00:00Z`;
    const b = `${TODAY_LOCAL}T08:00:00Z`;
    const c = `${TODAY_LOCAL}T09:00:00Z`;
    await writeMemoryFile("2026-06-23-a.md", "alpha", a);
    await writeMemoryFile("2026-06-23-b.md", "bravo", b);
    await writeMemoryFile("2026-06-23-c.md", "charlie", c);

    const result = await loadMemoryFiles({
      workspaceDir,
      config: resolveConfig({ maxFiles: 2 }),
      nowMs: NOW_MS,
    });

    assert.equal(result.files.length, 2);
    assert.equal(result.truncatedByFileCount, true);
    // Newest (c) must be first.
    assert.equal(result.files[0].basename, "2026-06-23-c.md");
    assert.equal(result.files[1].basename, "2026-06-23-b.md");
  });

  it("truncates content by token budget and drops the oldest file", async () => {
    // maxTokens: 25 → clamped to min 100 → budget = 400 chars.
    // Each file is 201 chars. Budget fits 1 full file (201 ≤ 400), second needs
    // 201 > remaining 199 → truncated, third skipped entirely.
    // Result: 2 files (one full, one truncated to 199 chars).
    // To get exactly 1 file: make each file > 400 chars.
    await writeMemoryFile("2026-06-23-d.md", "x".repeat(500), `${TODAY_LOCAL}T07:00:00Z`);
    await writeMemoryFile("2026-06-23-e.md", "y".repeat(500), `${TODAY_LOCAL}T08:00:00Z`);
    await writeMemoryFile("2026-06-23-f.md", "z".repeat(500), `${TODAY_LOCAL}T09:00:00Z`);

    const result = await loadMemoryFiles({
      workspaceDir,
      config: resolveConfig({ maxFiles: 5, maxTokens: 25 }),
      nowMs: NOW_MS,
    });

    // Budget = 400 chars. First file (newest): read 400 chars, totalChars=400.
    // Second file: remaining=0 → skip.
    assert.equal(result.files.length, 1);
    assert.equal(result.truncatedByTokenBudget, true);
    assert.equal(result.files[0].basename, "2026-06-23-f.md");
  });
});

describe("buildContextBlock", () => {
  it("returns an empty string when there are no files", () => {
    const block = buildContextBlock(
      { files: [], totalChars: 0, truncatedByTokenBudget: false, truncatedByFileCount: false },
      workspaceDir,
      resolveConfig({}),
    );
    assert.equal(block, "");
  });

  it("includes the configured label and a header line per file", () => {
    const cfg = resolveConfig({ contextLabel: "Recent memory" });
    const block = buildContextBlock(
      {
        files: [
          {
            absolutePath: join(memoryDir, "2026-06-23.md"),
            basename: "2026-06-23.md",
            mtimeMs: NOW_MS,
            logicalDate: "2026-06-23",
          },
        ],
        totalChars: 12,
        truncatedByTokenBudget: false,
        truncatedByFileCount: false,
      },
      workspaceDir,
      cfg,
    );
    assert.match(block, /## Recent memory/);
    assert.match(block, /2026-06-23\.md/);
    assert.match(block, /Total: 1 file/);
  });
});
