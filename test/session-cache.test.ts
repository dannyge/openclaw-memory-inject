/**
 * Unit tests for `SessionCache`. We exercise the seen/injected state
 * machine, the size cap eviction, and the lookup helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCache } from "../src/session-cache.js";

describe("SessionCache", () => {
  it("marks a session as seen exactly once", () => {
    const cache = new SessionCache();
    assert.equal(cache.markSeen("a"), true);
    assert.equal(cache.markSeen("a"), false);
    assert.equal(cache.hasSeen("a"), true);
  });

  it("distinguishes seen from injected", () => {
    const cache = new SessionCache();
    cache.markSeen("a");
    assert.equal(cache.hasSeen("a"), true);
    assert.equal(cache.hasInjected("a"), false);

    assert.equal(cache.markInjected("a"), true);
    assert.equal(cache.hasInjected("a"), true);

    // Re-marking injected is idempotent.
    assert.equal(cache.markInjected("a"), false);
  });

  it("forgets sessions on demand", () => {
    const cache = new SessionCache();
    cache.markSeen("a");
    cache.markInjected("a");
    cache.forget("a");
    assert.equal(cache.hasSeen("a"), false);
    assert.equal(cache.hasInjected("a"), false);
  });

  it("evicts oldest entries when the size cap is exceeded", () => {
    const cache = new SessionCache();
    // Insert 4096 distinct keys, then add one more.
    for (let i = 0; i < 4096; i++) {
      cache.markSeen(`s${i}`);
    }
    cache.markSeen("overflow");

    // After eviction, the cache must be strictly smaller than the cap.
    const { seen } = cache.size();
    assert.ok(seen < 4096, `expected seen < 4096, got ${seen}`);
    assert.equal(cache.hasSeen("overflow"), true);
  });
});
