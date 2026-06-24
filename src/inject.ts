/**
 * Hook wiring: turn `session_start` and `before_prompt_build` events into
 * `prependContext` payloads.
 *
 * Strategy:
 *   - On `session_start`, we record the session key (from event or ctx) in a
 *     `SessionCache`. Every `session_start` means a fresh session — we always
 *     mark it for injection.
 *   - On `before_prompt_build`, we only inject when:
 *       (a) the session was previously marked seen, AND
 *       (b) we have not already injected for this session.
 *     This ensures memory is injected at most once per session.
 *
 * The cache key is the `sessionKey` string, which is consistent across both
 * hooks (available in both `PluginHookSessionContext` and
 * `PluginHookAgentContext`).
 */

import { loadMemoryFiles, buildContextBlock } from "./memory-loader.js";
import { SessionCache } from "./session-cache.js";
import { resolveConfig } from "./config.js";
import type { ResolvedMemoryInjectConfig } from "./types.js";

/** A minimal, structural subset of the OpenClaw plugin API we depend on. */
export interface PluginApiLike {
  getConfig?: () => unknown;
  logger?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

/** Structural subset of `PluginHookSessionStartEvent + PluginHookSessionContext`. */
export interface SessionStartLike {
  sessionId?: string;
  sessionKey?: string;
  agentId?: string;
}

/** Structural subset of `PluginHookBeforePromptBuildEvent`. */
export interface BeforePromptBuildLike {
  prompt: string;
  messages: unknown[];
}

/** Structural subset of `PluginHookBeforePromptBuildResult`. */
export interface BeforePromptBuildResult {
  prependContext?: string;
}

/** Structural subset of `PluginHookAgentContext`. */
export interface AgentContextLike {
  agentId?: string;
  sessionKey?: string;
  workspaceDir?: string;
}

export interface HookHandlers {
  handleSessionStart: (event: SessionStartLike) => void;
  handleBeforePromptBuild: (
    event: BeforePromptBuildLike,
    ctx: AgentContextLike,
  ) => Promise<BeforePromptBuildResult | void>;
}

export function createHookHandlers(api: PluginApiLike = {}): HookHandlers {
  const cache = new SessionCache();

  const getConfig = (): ResolvedMemoryInjectConfig => {
    return resolveConfig(api.getConfig?.());
  };

  const log = {
    info: (msg: string) => api.logger?.info?.(msg),
    warn: (msg: string) => api.logger?.warn?.(msg),
    error: (msg: string) => api.logger?.error?.(msg),
  };

  return {
    handleSessionStart(event: SessionStartLike): void {
      const cfg = getConfig();
      if (!cfg.enabled) {
        return;
      }
      const key = event.sessionKey ?? event.sessionId;
      if (!key) {
        log.warn("[memory-inject] session_start without sessionKey or sessionId; skipping");
        return;
      }
      // Exclude agents at this stage too.
      if (event.agentId && cfg.excludeAgents.includes(event.agentId)) {
        return;
      }
      cache.markSeen(key);
    },

    async handleBeforePromptBuild(
      _event: BeforePromptBuildLike,
      ctx: AgentContextLike,
    ): Promise<BeforePromptBuildResult | void> {
      const cfg = getConfig();
      if (!cfg.enabled) {
        return;
      }
      if (ctx.agentId && cfg.excludeAgents.includes(ctx.agentId)) {
        return;
      }
      if (!ctx.workspaceDir) {
        return;
      }

      const key = ctx.sessionKey ?? ctx.agentId ?? "";
      if (!key || !cache.hasSeen(key)) {
        return;
      }
      if (cache.hasInjected(key)) {
        return;
      }

      let result;
      try {
        result = await loadMemoryFiles({ workspaceDir: ctx.workspaceDir, config: cfg });
      } catch (err) {
        log.error(`[memory-inject] failed to load memory: ${describeError(err)}`);
        return;
      }

      if (result.files.length === 0) {
        // Still mark as injected so we don't retry the disk on every turn.
        cache.markInjected(key);
        return;
      }

      const block = buildContextBlock(result, ctx.workspaceDir, cfg);
      if (!block) {
        return;
      }

      cache.markInjected(key);
      log.info(
        `[memory-inject] injected ${result.files.length} memory file(s) ` +
          `(~${Math.ceil(result.totalChars / 4)} tokens) into ${key}`,
      );
      return { prependContext: block };
    },
  };
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
