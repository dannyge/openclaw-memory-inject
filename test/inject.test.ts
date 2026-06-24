/**
 * Integration tests for the hook wiring. We exercise `createHookHandlers`
 * with a temp workspace, verifying that:
 *
 *   - session_start marks a session, before_prompt_build injects once.
 *   - Subsequent before_prompt_build calls on the same session are no-ops.
 *   - Excluded agents and disabled configs are honored.
 *   - Failures during memory load are swallowed (fail-open).
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, utimes, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHookHandlers } from "../src/inject.js";

let workspaceDir: string;
let memoryDir: string;
let nowMs: number;

beforeEach(async () => {
  workspaceDir = await mkdtemp(join(tmpdir(), "inject-"));
  memoryDir = join(workspaceDir, "memory");
  await mkdir(memoryDir, { recursive: true });
  nowMs = new Date("2026-06-23T12:00:00Z").getTime();
  const today = "2026-06-23";
  await writeFile(join(memoryDir, `${today}.md`), "today's notes", "utf-8");
  await utimes(join(memoryDir, `${today}.md`), nowMs / 1000, nowMs / 1000);
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("createHookHandlers", () => {
  it("injects once per session, then no-ops", async () => {
    const handlers = createHookHandlers({
      getConfig: () => ({}),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });

    // Simulate: session_start fires with a sessionKey.
    handlers.handleSessionStart({ sessionKey: "test-session-1", agentId: "ops" });

    const r1 = await handlers.handleBeforePromptBuild(
      { prompt: "hi", messages: [] },
      { agentId: "ops", sessionKey: "test-session-1", workspaceDir },
    );
    assert.ok(r1 && typeof r1 === "object" && "prependContext" in r1);
    assert.match(r1.prependContext!, /Recent memory/);
    assert.match(r1.prependContext!, /2026-06-23\.md/);
    // Regression guard: the injected context MUST contain the file's actual
    // contents (the beforeEach writes "today's notes"). A previous bug logged
    // "injected 1 file" but emitted an empty block — the filename appeared
    // while the body did not.
    assert.ok(
      r1.prependContext!.includes("today's notes"),
      "injected context must include the real file body, not just the filename",
    );

    // Second call on the same sessionKey: injection is skipped.
    const r2 = await handlers.handleBeforePromptBuild(
      { prompt: "hi again", messages: [] },
      { agentId: "ops", sessionKey: "test-session-1", workspaceDir },
    );
    assert.equal(r2, undefined);
  });

  it("respects the enabled=false master switch", async () => {
    const handlers = createHookHandlers({
      getConfig: () => ({ enabled: false }),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    handlers.handleSessionStart({ sessionKey: "s2", agentId: "ops" });
    const result = await handlers.handleBeforePromptBuild(
      { prompt: "hi", messages: [] },
      { agentId: "ops", sessionKey: "s2", workspaceDir },
    );
    assert.equal(result, undefined);
  });

  it("skips agents listed in excludeAgents", async () => {
    const handlers = createHookHandlers({
      getConfig: () => ({ excludeAgents: ["finance"] }),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    handlers.handleSessionStart({ sessionKey: "s3", agentId: "finance" });
    const result = await handlers.handleBeforePromptBuild(
      { prompt: "hi", messages: [] },
      { agentId: "finance", sessionKey: "s3", workspaceDir },
    );
    assert.equal(result, undefined);
  });

  it("does not inject if no session_start was received", async () => {
    const handlers = createHookHandlers({
      getConfig: () => ({}),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    // No handleSessionStart call — before_prompt_build should be a no-op.
    const result = await handlers.handleBeforePromptBuild(
      { prompt: "hi", messages: [] },
      { agentId: "ops", sessionKey: "s4", workspaceDir },
    );
    assert.equal(result, undefined);
  });

  it("falls back gracefully when workspaceDir is missing", async () => {
    const handlers = createHookHandlers({
      getConfig: () => ({}),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    handlers.handleSessionStart({ sessionKey: "s5", agentId: "ops" });
    const result = await handlers.handleBeforePromptBuild(
      { prompt: "hi", messages: [] },
      { agentId: "ops", sessionKey: "s5" },
    );
    assert.equal(result, undefined);
  });

  it("is fail-open: no-op when memory directory is missing", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "no-memory-"));
    const handlers = createHookHandlers({
      getConfig: () => ({}),
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
    handlers.handleSessionStart({ sessionKey: "s6", agentId: "ops" });
    const result = await handlers.handleBeforePromptBuild(
      { prompt: "hi", messages: [] },
      { agentId: "ops", sessionKey: "s6", workspaceDir: fresh },
    );
    assert.equal(result, undefined);
    await rm(fresh, { recursive: true, force: true });
  });
});
