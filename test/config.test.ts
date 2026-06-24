/**
 * Unit tests for `resolveConfig` — every documented default, every
 * invalid-input fallback, and the boundary clamping.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig, DEFAULT_CONFIG } from "../src/config.js";

describe("resolveConfig", () => {
  it("returns the documented defaults for null/undefined input", () => {
    for (const raw of [null, undefined, {}, "oops", 42, []]) {
      const cfg = resolveConfig(raw);
      assert.deepEqual(cfg, DEFAULT_CONFIG);
    }
  });

  it("preserves valid overrides", () => {
    const cfg = resolveConfig({
      enabled: false,
      memoryDir: "notes",
      daysToLoad: 7,
      maxFiles: 10,
      maxTokens: 8000,
      filenamePattern: "^foo-\\d+\\.md$",
      excludeAgents: ["finance"],
      contextLabel: "Custom label",
    });
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.memoryDir, "notes");
    assert.equal(cfg.daysToLoad, 7);
    assert.equal(cfg.maxFiles, 10);
    assert.equal(cfg.maxTokens, 8000);
    assert.equal(cfg.filenamePattern, "^foo-\\d+\\.md$");
    assert.deepEqual(cfg.excludeAgents, ["finance"]);
    assert.equal(cfg.contextLabel, "Custom label");
  });

  it("drops invalid types and keeps defaults for those fields", () => {
    const cfg = resolveConfig({
      enabled: "yes" as unknown as boolean,
      memoryDir: "",
      daysToLoad: 1.5,
      maxFiles: "two" as unknown as number,
      maxTokens: NaN,
      filenamePattern: "[unterminated",
    });
    assert.equal(cfg.enabled, DEFAULT_CONFIG.enabled);
    assert.equal(cfg.memoryDir, DEFAULT_CONFIG.memoryDir);
    // Non-integer / NaN values are ignored, defaults preserved.
    assert.equal(cfg.daysToLoad, DEFAULT_CONFIG.daysToLoad);
    assert.equal(cfg.maxFiles, DEFAULT_CONFIG.maxFiles);
    assert.equal(cfg.maxTokens, DEFAULT_CONFIG.maxTokens);
    assert.equal(cfg.filenamePattern, DEFAULT_CONFIG.filenamePattern);
  });

  it("clamps out-of-range numeric values to their allowed ranges", () => {
    const low = resolveConfig({ daysToLoad: 0, maxFiles: 0, maxTokens: 50 });
    assert.equal(low.daysToLoad, 1);
    assert.equal(low.maxFiles, 1);
    assert.equal(low.maxTokens, 100);

    const high = resolveConfig({ daysToLoad: 9999, maxFiles: 9999, maxTokens: 9_999_999 });
    assert.equal(high.daysToLoad, 365);
    assert.equal(high.maxFiles, 100);
    assert.equal(high.maxTokens, 128_000);
  });

  it("strips non-string excludeAgents entries", () => {
    const cfg = resolveConfig({ excludeAgents: ["ops", 1, null, "kb"] });
    assert.deepEqual(cfg.excludeAgents, ["ops", "kb"]);
  });

  it("rejects memoryDir with NUL bytes", () => {
    const cfg = resolveConfig({ memoryDir: "foo\0bar" });
    assert.equal(cfg.memoryDir, DEFAULT_CONFIG.memoryDir);
  });
});
