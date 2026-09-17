import { describe, expect, it } from "vitest";
import { GET, redact, validateBody } from "@/app/api/route/route";
import { toolRouterOptions } from "@/lib/routerConfigs";

describe("redact", () => {
  it("replaces every occurrence of the secret", () => {
    expect(redact("key sk-abcdefgh123 was rejected; sk-abcdefgh123 again", "sk-abcdefgh123")).toBe("key [redacted] was rejected; [redacted] again");
  });
  it("leaves text alone when there is no usable secret", () => {
    expect(redact("nothing here", undefined)).toBe("nothing here");
    expect(redact("short", "abc")).toBe("short");
  });
});

describe("validateBody", () => {
  const good = { mode: "tool", userInput: "hi there", options: toolRouterOptions };
  it("accepts a well-formed body", () => {
    expect(validateBody(good)).toBeNull();
    expect(validateBody({ ...good, confidenceThreshold: 0.5, context: "earlier" })).toBeNull();
  });
  it("rejects bad modes, empty input, short option lists, and out-of-range thresholds", () => {
    expect(validateBody({ ...good, mode: "nope" })).toMatch(/mode/);
    expect(validateBody({ ...good, userInput: "  " })).toMatch(/userInput/);
    expect(validateBody({ ...good, options: [toolRouterOptions[0]] })).toMatch(/options/);
    expect(validateBody({ ...good, confidenceThreshold: 1.5 })).toMatch(/confidenceThreshold/);
  });
});

describe("GET /api/route", () => {
  it("reports only whether the server has a key, never the key itself", async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body)).toEqual(["live"]);
    expect(typeof body.live).toBe("boolean");
  });
});
