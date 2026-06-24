/**
 * Configuration types and validation for the memory-inject plugin.
 *
 * The plugin reads its configuration from `api.getConfig()`. We keep
 * validation defensive: any unknown / invalid value falls back to the
 * documented default. The plugin is fail-open by design — a broken config
 * should never block an agent turn.
 */

import type { ResolvedMemoryInjectConfig as Resolved } from "./types.js";

export const DEFAULT_CONFIG: Resolved = {
  enabled: true,
  memoryDir: "memory",
  daysToLoad: 2,
  maxFiles: 4,
  maxTokens: 4000,
  filenamePattern: "^\\d{4}-\\d{2}-\\d{2}(-.+)?\\.md$",
  excludeAgents: [],
  contextLabel: "Recent memory (auto-injected by memory-inject plugin)",
};

/**
 * Read and validate the plugin configuration. Unknown or invalid keys are
 * dropped; invalid values are replaced by their defaults. The returned object
 * is fully populated — callers can rely on every documented field being
 * present and of the correct type.
 */
export function resolveConfig(raw: unknown): Resolved {
  const out: Resolved = { ...DEFAULT_CONFIG };
  if (!isPlainObject(raw)) {
    return out;
  }

  if (typeof raw.enabled === "boolean") {
    out.enabled = raw.enabled;
  }

  if (typeof raw.memoryDir === "string" && raw.memoryDir.length > 0 && !raw.memoryDir.includes("\0")) {
    out.memoryDir = raw.memoryDir;
  }

  if (typeof raw.daysToLoad === "number" && Number.isFinite(raw.daysToLoad) && Number.isInteger(raw.daysToLoad)) {
    out.daysToLoad = clampInt(raw.daysToLoad, 1, 365);
  }

  if (typeof raw.maxFiles === "number" && Number.isFinite(raw.maxFiles) && Number.isInteger(raw.maxFiles)) {
    out.maxFiles = clampInt(raw.maxFiles, 1, 100);
  }

  if (typeof raw.maxTokens === "number" && Number.isFinite(raw.maxTokens) && Number.isInteger(raw.maxTokens)) {
    out.maxTokens = clampInt(raw.maxTokens, 100, 128_000);
  }

  if (typeof raw.filenamePattern === "string" && raw.filenamePattern.length > 0) {
    try {
      new RegExp(raw.filenamePattern);
      out.filenamePattern = raw.filenamePattern;
    } catch {
      // Keep default — pattern must compile.
    }
  }

  if (Array.isArray(raw.excludeAgents)) {
    out.excludeAgents = raw.excludeAgents.filter((v): v is string => typeof v === "string" && v.length > 0);
  }

  if (typeof raw.contextLabel === "string") {
    out.contextLabel = raw.contextLabel;
  }

  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clampInt(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
