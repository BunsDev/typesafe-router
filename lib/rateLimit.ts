/**
 * Small in-memory sliding-window rate limiter.
 *
 * `POST /api/route` uses it to cap how often one caller can spend the SERVER's
 * TypeSafe key. Requests that carry the user's own key are not limited: they
 * spend the user's credits, not the deployer's.
 *
 * It is per-process. On a serverless platform every instance keeps its own
 * counters, so treat it as a brake on casual abuse, not a hard global quota.
 * Put a gateway limiter in front of a public deployment if that matters.
 *
 * Memory is hard-bounded at `MAX_TRACKED_KEYS` entries, each holding at most
 * `limit` timestamps. The cap is enforced on every insertion, so a burst of
 * distinct keys inside one millisecond cannot grow the map. Map iteration order
 * is kept as "least recently seen first" — every hit re-inserts its key,
 * whether it was allowed or refused — so eviction takes the callers that have
 * been quiet longest, and a caller that keeps retrying while throttled cannot
 * age into the eviction window and come back with a fresh budget. A full scan
 * for keys that went idle is cheaper than it is useful, so it runs at most once
 * per second and the O(1) eviction below is what actually holds the line.
 *
 * An evicted caller does start over. That is the honest cost of a bounded map:
 * the alternative is unbounded memory. It takes more than `MAX_TRACKED_KEYS`
 * distinct, more-recently-seen callers in one window to displace an active one.
 */

export type RateLimiter = {
  /**
   * Record one hit for `key` and report whether it is within `limit` hits per
   * window. A `limit` of 0 or less disables limiting.
   */
  allow(key: string, limit: number, now?: number): boolean;
  /** Number of callers currently tracked. Never above `MAX_TRACKED_KEYS`. */
  size(): number;
  reset(): void;
};

export const MAX_TRACKED_KEYS = 10_000;
const SWEEP_INTERVAL_MS = 1_000;

export function createRateLimiter(windowMs: number): RateLimiter {
  // Insertion order doubles as recency: a key is re-inserted on every hit.
  const hits = new Map<string, number[]>();
  let lastSweep = Number.NEGATIVE_INFINITY;

  /** Drop keys with no hits left inside the window. O(n), so it is rate limited itself. */
  function pruneIdle(cutoff: number) {
    for (const [key, times] of hits) {
      if (!times.some((t) => t > cutoff)) hits.delete(key);
    }
  }

  /** Re-insert so this key becomes the most recently seen. */
  function touch(key: string, times: number[]) {
    hits.delete(key);
    hits.set(key, times);
  }

  function enforceCap(now: number, cutoff: number) {
    if (hits.size <= MAX_TRACKED_KEYS) return;
    if (now - lastSweep >= SWEEP_INTERVAL_MS) {
      lastSweep = now;
      pruneIdle(cutoff);
    }
    // Whatever the sweep left behind, the cap holds: drop the least recently seen.
    while (hits.size > MAX_TRACKED_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    allow(key, limit, now = Date.now()) {
      if (!(limit > 0)) return true;
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);

      if (recent.length >= limit) {
        // Refused, but still seen: keep its place at the back of the eviction queue.
        touch(key, recent);
        return false;
      }

      recent.push(now);
      touch(key, recent);
      enforceCap(now, cutoff);
      return true;
    },
    size() {
      return hits.size;
    },
    reset() {
      hits.clear();
      lastSweep = Number.NEGATIVE_INFINITY;
    },
  };
}
