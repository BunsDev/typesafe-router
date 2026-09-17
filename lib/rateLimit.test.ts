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

  it("bounds memory under a flood of distinct keys, sweeping at most once a second", () => {
    const limiter = createRateLimiter(60_000);
    const flood = MAX_TRACKED_KEYS + 500;
    for (let i = 0; i < flood; i++) limiter.allow(`ip-${i}`, 10, 5_000);
    // one sweep fired when the cap was first crossed; the rest of the same second is not re-scanned
    expect(limiter.size()).toBeLessThanOrEqual(flood - 1);
    expect(limiter.size()).toBeGreaterThan(MAX_TRACKED_KEYS);
    limiter.allow("late", 10, 6_500);
    expect(limiter.size()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
    // the least recently seen keys were the ones evicted; the newest survive
    expect(limiter.allow("late", 1, 6_600)).toBe(false);
    expect(limiter.allow(`ip-${flood - 1}`, 1, 6_600)).toBe(false);
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
