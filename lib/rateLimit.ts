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
 */

export type RateLimiter = {
  /**
   * Record one hit for `key` and report whether it is within `limit` hits per
   * window. A `limit` of 0 or less disables limiting.
   */
  allow(key: string, limit: number, now?: number): boolean;
  reset(): void;
};

const MAX_TRACKED_KEYS = 10_000;

export function createRateLimiter(windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();

  function prune(cutoff: number) {
    for (const [key, times] of hits) {
      if (!times.some((t) => t > cutoff)) hits.delete(key);
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
      hits.set(key, recent);
if (hits.size > MAX_TRACKED_KEYS) {
        prune(cutoff);
        if (hits.size > MAX_TRACKED_KEYS) {
          const oldestKey = hits.keys().next().value;
          if (oldestKey !== undefined) hits.delete(oldestKey);
        }
      }
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}
