import { describe, expect, it } from "vitest";
import { createRateLimiter, MAX_TRACKED_KEYS } from "@/lib/rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit per window and refuses after", () => {
    const limiter = createRateLimiter(60_000);
    expect(limiter.allow("a", 2, 1_000)).toBe(true);
    expect(limiter.allow("a", 2, 2_000)).toBe(true);
    expect(limiter.allow("a", 2, 3_000)).toBe(false);
    // other keys have their own budget
    expect(limiter.allow("b", 2, 3_000)).toBe(true);
  });

  it("frees budget as old hits leave the window", () => {
    const limiter = createRateLimiter(60_000);
    limiter.allow("a", 1, 0);
    expect(limiter.allow("a", 1, 59_000)).toBe(false);
    expect(limiter.allow("a", 1, 60_001)).toBe(true);
  });

  it("is disabled for a non-positive limit", () => {
    const limiter = createRateLimiter(60_000);
    for (let i = 0; i < 5; i++) expect(limiter.allow("a", 0, i)).toBe(true);
    expect(limiter.allow("a", -1, 6)).toBe(true);
  });

  it("never exceeds the key cap, even for a burst inside one millisecond", () => {
    const limiter = createRateLimiter(60_000);
    let peak = 0;
    for (let i = 0; i < MAX_TRACKED_KEYS + 500; i++) {
      limiter.allow(`ip-${i}`, 10, 5_000);
      peak = Math.max(peak, limiter.size());
    }
    expect(peak).toBe(MAX_TRACKED_KEYS);
    // the most recently seen callers are the ones kept
    expect(limiter.allow(`ip-${MAX_TRACKED_KEYS + 499}`, 1, 5_001)).toBe(false);
  });

  it("does not hand a throttled caller a fresh budget after a distinct-key flood", () => {
    const limiter = createRateLimiter(60_000);
    expect(limiter.allow("attacker", 1, 1_000)).toBe(true);
    expect(limiter.allow("attacker", 1, 1_001)).toBe(false);

    // A flood of distinct keys evicts the quietest callers. The attacker keeps
    // retrying, so it stays at the back of the queue and stays refused.
    for (let i = 0; i < MAX_TRACKED_KEYS + 200; i++) {
      limiter.allow(`ip-${i}`, 10, 2_000);
      if (i % 500 === 0) expect(limiter.allow("attacker", 1, 2_000)).toBe(false);
    }
    expect(limiter.allow("attacker", 1, 2_100)).toBe(false);
    expect(limiter.size()).toBe(MAX_TRACKED_KEYS);
  });

  it("frees idle keys before evicting active ones", () => {
    const limiter = createRateLimiter(1_000);
    for (let i = 0; i < MAX_TRACKED_KEYS + 1; i++) limiter.allow(`old-${i}`, 10, 0);
    for (let i = 0; i < 50; i++) limiter.allow(`new-${i}`, 10, 5_000);
    expect(limiter.size()).toBe(50);
  });

  it("reset clears every key", () => {
    const limiter = createRateLimiter(60_000);
    limiter.allow("a", 1, 0);
    limiter.reset();
    expect(limiter.allow("a", 1, 1)).toBe(true);
  });
});
