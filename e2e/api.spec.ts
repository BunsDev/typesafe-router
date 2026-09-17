import { expect, test } from "@playwright/test";

const options = [
  { id: "web_search", label: "Web search", description: "Current information or news." },
  { id: "calculator", label: "Calculator", description: "Arithmetic." },
  { id: "no_tool_needed", label: "No tool needed", description: "Answer directly." },
];

test.describe("POST /api/route in demo mode", () => {
  test("routes and reports the simulator as the source", async ({ request }) => {
    const res = await request.post("/api/route", { data: { mode: "tool", userInput: "What is 12 * 4?", options } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result.source).toBe("mock");
    expect(body.result.effectiveOptionId).toBe("calculator");
    expect(Object.keys(body.result.decision.allOptionScores).sort()).toEqual(options.map((o) => o.id).sort());
  });

  test("keeps prototype-named option ids in the closed set", async ({ request }) => {
    const odd = [
      { id: "__proto__", label: "P", description: "x" },
      { id: "constructor", label: "C", description: "y" },
      options[2],
    ];
    const res = await request.post("/api/route", { data: { mode: "tool", userInput: "hello", options: odd } });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Object.keys(body.result.decision.allOptionScores)).toEqual(["__proto__", "constructor", "no_tool_needed"]);
  });

  test("rejects oversized fields and bodies", async ({ request }) => {
    const longContext = await request.post("/api/route", { data: { mode: "tool", userInput: "hi", context: "x".repeat(20_001), options } });
    expect(longContext.status()).toBe(400);
    expect((await longContext.json()).error).toMatch(/Context is too long/);

    const huge = await request.post("/api/route", { data: { mode: "tool", userInput: "hi", context: "x".repeat(300_000), options } });
    expect(huge.status()).toBe(413);
  });

  test("refuses a list without the required option before routing", async ({ request }) => {
    const res = await request.post("/api/route", { data: { mode: "tool", userInput: "hi", options: options.slice(0, 2) } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("config");
    expect(body.error).toContain("no_tool_needed");
  });

  test("GET reports only whether the server has a key", async ({ request }) => {
    const body = await (await request.get("/api/route")).json();
    expect(body).toEqual({ live: false });
  });
});
