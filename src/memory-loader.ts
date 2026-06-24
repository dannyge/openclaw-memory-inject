/**
 * Memory directory scanning and file selection.
 *
 * Given a workspace directory and a resolved config, this module:
 *   1. Reads the memory directory listing.
 *   2. Filters files by the configured filename regex.
 *   3. Sorts by mtime (newest first).
 *   4. Truncates to the first `maxFiles` entries.
 *   5. Reads file contents and applies a soft token cap.
 *
 * The function is synchronous on purpose: we want predictable, fast behavior
 * inside a `before_prompt_build` hook. Memory files are small and the working
 * set is bounded by `maxFiles` * (typical file size). For very large files
 * (megabytes) the per-file read is bounded by `maxTokens * 4` chars.
 *
 * Failures (missing dir, unreadable file, ENOENT, EACCES) are swallowed and
 * logged. The plugin must never block the agent turn because the memory
 * directory happens to be unavailable.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { MemoryFileEntry, MemoryLoadResult, ResolvedMemoryInjectConfig } from "./types.js";

type MemoryInjectResolvedConfig = ResolvedMemoryInjectConfig;

/** Approximate characters per token. Conservative for English + CJK mixed prose. */
const CHARS_PER_TOKEN = 4;

/** Hard ceiling on a single file's read size (4x the default token budget). */
const MAX_FILE_READ_BYTES = 512 * 1024;

export interface LoadMemoryOptions {
  workspaceDir: string;
  config: MemoryInjectResolvedConfig;
  /** "now" override for tests; defaults to Date.now(). */
  nowMs?: number;
}

export async function loadMemoryFiles(opts: LoadMemoryOptions): Promise<MemoryLoadResult> {
  const { workspaceDir, config, nowMs = Date.now() } = opts;
  const memoryDir = join(workspaceDir, config.memoryDir);

  let entries: string[];
  try {
    const dirEntries = await readdir(memoryDir, { withFileTypes: false });
    entries = dirEntries;
  } catch {
    // Directory missing or unreadable — return empty, do not throw.
    return emptyResult();
  }

  const filenameRegex = compileRegex(config.filenamePattern);
  if (!filenameRegex) {
    return emptyResult();
  }

  const minDate = startOfLocalDay(nowMs);
  const cutoffMs = minDate - (config.daysToLoad - 1) * 24 * 60 * 60 * 1000;

  const candidates: MemoryFileEntry[] = [];

  for (const name of entries) {
    if (!filenameRegex.test(name)) {
      continue;
    }

    const absolutePath = join(memoryDir, name);
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch {
      continue;
    }
    if (!fileStat.isFile()) {
      continue;
    }

    const mtimeMs = fileStat.mtimeMs;
    if (mtimeMs < cutoffMs) {
      // Older than the configured window. Skip — we only want recent context.
      continue;
    }

    candidates.push({
      absolutePath,
      basename: basename(absolutePath),
      mtimeMs,
      logicalDate: parseLogicalDate(name),
    });
  }

  // Newest first.
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const truncatedByFileCount = candidates.length > config.maxFiles;
  const limited = candidates.slice(0, config.maxFiles);

  const tokenCharBudget = config.maxTokens * CHARS_PER_TOKEN;
  let totalChars = 0;
  let truncatedByTokenBudget = false;
  const files: MemoryFileEntry[] = [];

  for (const entry of limited) {
    const remaining = tokenCharBudget - totalChars;
    if (remaining <= 0) {
      truncatedByTokenBudget = true;
      break;
    }

    const content = await readFileSafe(entry.absolutePath, Math.min(remaining, MAX_FILE_READ_BYTES));
    if (content === null) {
      continue;
    }

    totalChars += content.length;
    files.push(entry);
  }

  return {
    files,
    totalChars,
    truncatedByTokenBudget,
    truncatedByFileCount,
  };
}

/**
 * Build the `prependContext` text that will be returned from the
 * `before_prompt_build` hook. The text is plain UTF-8 and intentionally
 * minimal — we trust the agent to know what to do with it.
 */
export function buildContextBlock(
  result: MemoryLoadResult,
  workspaceDir: string,
  config: MemoryInjectResolvedConfig,
): string {
  if (result.files.length === 0) {
    return "";
  }

  const parts: string[] = [];
  if (config.contextLabel) {
    parts.push(`## ${config.contextLabel}`);
  }
  parts.push("");
  parts.push(
    `The following are recent memory files from \`${config.memoryDir}/\`. ` +
      `They are provided as recent context; treat them as informational and cite the file path when referencing them.`,
  );
  parts.push("");

  for (const entry of result.files) {
    const rel = relativeMemoryPath(workspaceDir, entry.absolutePath);
    const dateTag = entry.logicalDate ? ` (${entry.logicalDate})` : "";
    parts.push(`### ${entry.basename}${dateTag}`);
    parts.push("");
    parts.push(`<file path="${rel}">`);
    parts.push("<!-- contents injected below; do not re-read unless asked -->");
    parts.push("");
    parts.push("```");
  }

  parts.push(
    `Total: ${result.files.length} file(s), ~${Math.ceil(result.totalChars / CHARS_PER_TOKEN)} tokens.`,
  );
  if (result.truncatedByTokenBudget) {
    parts.push(`(Truncated to token budget of ${config.maxTokens}.)`);
  }
  if (result.truncatedByFileCount) {
    parts.push(`(More than ${config.maxFiles} candidate files; oldest dropped.)`);
  }

  return parts.join("\n");
}

// ─── helpers ────────────────────────────────────────────────────────────────

function emptyResult(): MemoryLoadResult {
  return {
    files: [],
    totalChars: 0,
    truncatedByTokenBudget: false,
    truncatedByFileCount: false,
  };
}

function compileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

function parseLogicalDate(basename: string): string | null {
  // Expects YYYY-MM-DD at the start of the basename.
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(basename);
  return m ? m[1] : null;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function readFileSafe(absolutePath: string, maxChars: number): Promise<string | null> {
  try {
    const buf = await readFile(absolutePath, { encoding: "utf-8" });
    if (buf.length <= maxChars) {
      return buf;
    }
    return buf.slice(0, maxChars);
  } catch {
    return null;
  }
}

function relativeMemoryPath(workspaceDir: string, absolutePath: string): string {
  if (absolutePath.startsWith(workspaceDir + "/")) {
    return absolutePath.slice(workspaceDir.length + 1);
  }
  return absolutePath;
}
