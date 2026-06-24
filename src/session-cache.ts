/**
 * Per-session de-duplication cache.
 *
 * The plugin uses two pieces of state to decide whether a given
 * `before_prompt_build` call should inject memory:
 *
 *   1. A `seenSessions` set, populated by the `session_start` hook. It marks
 *      sessions that have begun with a reason we care about. This is the
 *      source of truth for "is this a new session that should be primed?".
 *
 *   2. A `injectedSessions` set, populated when we actually emit context for
 *      a session. The `before_prompt_build` hook fires on every turn, but we
 *      only want to inject memory once per session — otherwise we'd burn
 *      tokens re-reading the same files for every user message.
 *
 * Both sets are kept in process memory only. They reset on Gateway restart,
 * which is acceptable: a fresh Gateway is a fresh process, and we want new
 * sessions after a restart to be primed again.
 *
 * The cache is bounded by `MAX_CACHE_SIZE` to avoid leaking memory in long-
 * running Gateways with very high session churn. When the cap is reached the
 * oldest entries are evicted.
 */

const MAX_CACHE_SIZE = 4096;

export class SessionCache {
  private readonly seen = new Map<string, true>();
  private readonly injected = new Map<string, true>();

  /**
   * Mark a session as one we should consider for injection. Returns `true`
   * if the session was previously unseen, `false` if it was already marked.
   */
  markSeen(sessionKey: string): boolean {
    if (this.seen.has(sessionKey)) {
      return false;
    }
    this.evictIfFull(this.seen);
    this.seen.set(sessionKey, true);
    return true;
  }

  /**
   * Returns `true` if this session has been marked as seen by a prior
   * `session_start` event. Used by `before_prompt_build` to decide whether
   * it should consider this session eligible for memory injection.
   */
  hasSeen(sessionKey: string): boolean {
    return this.seen.has(sessionKey);
  }

  /**
   * Returns `true` if this session has already had memory injected.
   */
  hasInjected(sessionKey: string): boolean {
    return this.injected.has(sessionKey);
  }

  /**
   * Mark a session as injected. Returns `true` if this is the first time
   * (i.e. caller should actually perform the injection), `false` if the
   * session was already injected.
   */
  markInjected(sessionKey: string): boolean {
    if (this.injected.has(sessionKey)) {
      return false;
    }
    this.evictIfFull(this.injected);
    this.injected.set(sessionKey, true);
    return true;
  }

  /**
   * Forget a session. Useful for `session_end` cleanup if you want to keep
   * the cache tight; in practice we just rely on the size cap.
   */
  forget(sessionKey: string): void {
    this.seen.delete(sessionKey);
    this.injected.delete(sessionKey);
  }

  /** Test/debug helper. Not used in production code paths. */
  size(): { seen: number; injected: number } {
    return { seen: this.seen.size, injected: this.injected.size };
  }

  private evictIfFull(map: Map<string, true>): void {
    if (map.size < MAX_CACHE_SIZE) {
      return;
    }
    // Evict ~10% of oldest entries to amortize cost.
    const evictCount = Math.ceil(MAX_CACHE_SIZE * 0.1);
    const keys = map.keys();
    for (let i = 0; i < evictCount; i++) {
      const next = keys.next();
      if (next.done) {
        break;
      }
      map.delete(next.value);
    }
  }
}
