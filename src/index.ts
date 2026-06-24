/**
 * memory-inject plugin entry point.
 *
 * Registers two hooks with the OpenClaw runtime:
 *
 *   - `session_start`  — records which new sessions should receive context.
 *   - `before_prompt_build` — emits `prependContext` for those sessions.
 *
 * Both hooks consult a single in-process `SessionCache` so that we inject at
 * most once per session.
 */

import { createHookHandlers } from "./inject.js";

interface RegisterApi {
  on: (name: string, handler: unknown) => void;
  getConfig?: () => unknown;
  logger?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

interface PluginEntry {
  id: string;
  name: string;
  description: string;
  register: (api: RegisterApi) => void;
}

export function register(api: RegisterApi): void {
  const handlers = createHookHandlers({
    getConfig: api.getConfig,
    logger: api.logger,
  });

  api.on("session_start", (event: unknown) => {
    return handlers.handleSessionStart(event as Parameters<typeof handlers.handleSessionStart>[0]);
  });

  api.on("before_prompt_build", async (event: unknown, ctx: unknown) => {
    return handlers.handleBeforePromptBuild(
      event as Parameters<typeof handlers.handleBeforePromptBuild>[0],
      ctx as Parameters<typeof handlers.handleBeforePromptBuild>[1],
    );
  });
}

const entry: PluginEntry = {
  id: "memory-inject",
  name: "Memory Inject",
  description: "Auto-inject recent memory/*.md files into new sessions via before_prompt_build.",
  register,
};

export default entry;

// Re-export for tests and advanced composition.
export { SessionCache } from "./session-cache.js";
export { createHookHandlers } from "./inject.js";
export { resolveConfig, DEFAULT_CONFIG } from "./config.js";
export { loadMemoryFiles, buildContextBlock } from "./memory-loader.js";
export type {
  MemoryInjectConfig,
  ResolvedMemoryInjectConfig,
  MemoryFileEntry,
  MemoryLoadResult,
} from "./types.js";
