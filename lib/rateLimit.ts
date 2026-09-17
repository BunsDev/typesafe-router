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
 * Memory is bounded: at most `MAX_TRACKED_KEYS` callers are tracked. Idle keys
 * are dropped first; if a flood of distinct keys still exceeds the cap, the
 * least recently seen keys are evicted (and get a fresh budget if they return).
 * The sweep runs at most once per second so a flood can't turn every request
 * into a full scan.
 */

export type RateLimiter = {
  /**
   * Record one hit for `key` and report whether it is within `limit` hits per
   * window. A `limit` of 0 or less disables limiting.
   */
  allow(key: string, limit: number, now?: number): boolean;
  /** Number of callers currently tracked. */
  size(): number;
  reset(): void;
};

export const MAX_TRACKED_KEYS = 10_000;
const SWEEP_INTERVAL_MS = 1_000;

export function createRateLimiter(windowMs: number): RateLimiter {
  // Insertion order doubles as recency: a key is re-inserted on every allowed hit.
  const hits = new Map<string, number[]>();
  let lastSweep = Number.NEGATIVE_INFINITY;

  function sweep(cutoff: number) {
    for (const [key, times] of hits) {
      if (!times.some((t) => t > cutoff)) hits.delete(key);
    }
    let excess = hits.size - MAX_TRACKED_KEYS;
    if (excess <= 0) return;
    for (const key of hits.keys()) {
      hits.delete(key);
      if (--excess <= 0) break;
    }
  }

  return {
    allow(key, limit, now = Date.now()) {
      if (!(limit > 0)) return true;
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.delete(key);
      hits.set(key, recent);
      if (hits.size > MAX_TRACKED_KEYS && now - lastSweep >= SWEEP_INTERVAL_MS) {
        lastSweep = now;
        sweep(cutoff);
      }
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
