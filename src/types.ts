/**
 * Public type declarations for the memory-inject plugin.
 *
 * These mirror the `configSchema` in `openclaw.plugin.json`. Keep them in sync
 * if you add or remove fields there.
 */

export interface MemoryInjectConfig {
  enabled?: boolean;
  memoryDir?: string;
  daysToLoad?: number;
  maxFiles?: number;
  maxTokens?: number;
  filenamePattern?: string;
  excludeAgents?: string[];
  contextLabel?: string;
}

/** `MemoryInjectConfig` with every optional field populated. */
export type ResolvedMemoryInjectConfig = Required<MemoryInjectConfig>;

/**
 * One scanned memory file, before we read its contents.
 */
export interface MemoryFileEntry {
  absolutePath: string;
  basename: string;
  mtimeMs: number;
  /**
   * "Logical" date parsed from the basename, e.g. `2026-06-23`. Files without
   * a parseable date are tagged `null` here.
   */
  logicalDate: string | null;
}

/**
 * Result of a memory load — at most `maxFiles` entries, with cumulative
 * size information so the injector can decide whether to truncate.
 */
export interface MemoryLoadResult {
  files: MemoryFileEntry[];
  totalChars: number;
  truncatedByTokenBudget: boolean;
  truncatedByFileCount: boolean;
}
