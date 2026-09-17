import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/rateLimit";

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

  it("reset clears every key", () => {
    const limiter = createRateLimiter(60_000);
    limiter.allow("a", 1, 0);
    limiter.reset();
    expect(limiter.allow("a", 1, 1)).toBe(true);
  });
});
