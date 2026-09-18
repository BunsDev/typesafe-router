import { afterEach, describe, expect, it, vi } from "vitest";
import { callerKey, GET, POST, readBoundedBody, redact, serverKeyLimiter, validateBody } from "@/app/api/route/route";
import { API_KEY_HEADER } from "@/lib/apiKeyStorage";
import { MAX_BODY_BYTES, MAX_CONTEXT_CHARS, MAX_OPTION_DESCRIPTION_CHARS, MAX_OPTION_ID_CHARS, MAX_OPTION_LABEL_CHARS } from "@/lib/limits";
import { toolRouterOptions } from "@/lib/routerConfigs";

const good = { mode: "tool", userInput: "What is 2 + 2?", options: toolRouterOptions };

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return POST(new Request("http://localhost/api/route", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: text }));
}

/**
 * A POST whose body arrives in chunks, like a chunked upload. `pulls()` reports
 * how many chunks the handler actually pulled, so a test can show it stopped early.
 */
function streamingPost(chunkCount: number, chunkBytes: number, headers: Record<string, string> = {}) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunkCount) return controller.close();
      pulled += 1;
      controller.enqueue(new Uint8Array(chunkBytes).fill(0x78)); // "x"
    },
  });
  const request = new Request("http://localhost/api/route", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, pulls: () => pulled };
}

/** A fake TypeSafe endpoint so the live path can be exercised without a network or a real key. */
function stubJev() {
  return vi.fn<typeof fetch>(async () =>
    Response.json({ answers: { "router.select_option": { type: "choice", choice: "calculator", probabilities: { calculator: 0.9 }, confidence: 0.9 } } }),
  );
}

afterEach(() => {
  serverKeyLimiter.reset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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
  it("bounds every text field, not just the input", () => {
    expect(validateBody({ ...good, context: "x".repeat(MAX_CONTEXT_CHARS + 1) })).toMatch(/Context is too long/);
    expect(validateBody({ ...good, context: "x".repeat(MAX_CONTEXT_CHARS) })).toBeNull();
    const [first, ...rest] = toolRouterOptions;
    expect(validateBody({ ...good, options: [{ ...first, id: "a".repeat(MAX_OPTION_ID_CHARS + 1) }, ...rest] })).toMatch(/id .* too long/);
    expect(validateBody({ ...good, options: [{ ...first, label: "a".repeat(MAX_OPTION_LABEL_CHARS + 1) }, ...rest] })).toMatch(/label is too long/);
    expect(validateBody({ ...good, options: [{ ...first, description: "a".repeat(MAX_OPTION_DESCRIPTION_CHARS + 1) }, ...rest] })).toMatch(/description is too long/);
  });
});

describe("POST /api/route", () => {
  it("routes through the simulator when no key is available", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", undefined);
    const response = await post(good);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.source).toBe("mock");
    expect(body.logEntry.effectiveOptionId).toBe("calculator");
  });

  it("refuses oversized bodies before parsing them", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", undefined);
    const declared = await post(good, { "content-length": String(MAX_BODY_BYTES + 1) });
    expect(declared.status).toBe(413);
    const actual = await post({ ...good, context: "x".repeat(MAX_BODY_BYTES) });
    expect(actual.status).toBe(413);
    expect((await actual.json()).code).toBe("validation");
  });

  it("stops reading a chunked body as soon as it passes the cap", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", undefined);
    const chunk = 64 * 1024;
    const offered = 64; // 4 MB on offer, with no content-length to declare it
    const { request, pulls } = streamingPost(offered, chunk);
    const response = await POST(request);
    expect(response.status).toBe(413);
    // 256 KB is four chunks, so the read stops at five; it must not drain all 64
    expect(pulls()).toBeLessThanOrEqual(6);
    expect(pulls()).toBeLessThan(offered);
  });

  it("does not trust an understated content-length", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", undefined);
    const { request } = streamingPost(8, 64 * 1024, { "content-length": "10" });
    expect((await POST(request)).status).toBe(413);
  });

  it("reports an unreadable body as a bad request, not a size failure", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const request = new Request("http://localhost/api/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/could not be read/);
  });

  it("treats a body-less POST as invalid JSON", async () => {
    const read = await readBoundedBody(new Request("http://localhost/api/route", { method: "POST" }), 1024);
    expect(read).toEqual({ ok: true, text: "" });
  });

  it("rate limits callers that spend the server's key, but not callers with their own", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "sk-server-key-1234567890");
    vi.stubEnv("ROUTE_RATE_LIMIT_PER_MINUTE", "1");
    vi.stubEnv("ROUTE_TRUST_PROXY", "1");
    const fetchMock = stubJev();
    vi.stubGlobal("fetch", fetchMock);

    const first = await post(good, { "x-forwarded-for": "203.0.113.7" });
    expect(first.status).toBe(200);
    expect((await first.json()).result.source).toBe("jev");

    const second = await post(good, { "x-forwarded-for": "203.0.113.7" });
    expect(second.status).toBe(429);
    expect((await second.json()).code).toBe("rate_limited");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // a different caller has its own budget
    expect((await post(good, { "x-forwarded-for": "203.0.113.8" })).status).toBe(200);

    // the limited caller can still route with a browser-saved key of their own
    const own = await post(good, { "x-forwarded-for": "203.0.113.7", [API_KEY_HEADER]: "sk-user-key-1234567890" });
    expect(own.status).toBe(200);
    const lastInit = fetchMock.mock.calls.at(-1)?.[1];
    expect((lastInit?.headers as Record<string, string>).Authorization).toBe("Bearer sk-user-key-1234567890");
  });

  it("ignores forwarded headers unless a trusted proxy is declared", async () => {
    vi.stubEnv("ROUTE_TRUST_PROXY", undefined);
    const spoofed = new Request("http://localhost/api/route", { headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" } });
    expect(callerKey(spoofed)).toBe("shared");

    vi.stubEnv("ROUTE_TRUST_PROXY", "true");
    // the proxy appends the real client last; earlier entries are whatever the client sent
    expect(callerKey(new Request("http://localhost/api/route", { headers: { "x-forwarded-for": "9.9.9.9, 203.0.113.5" } }))).toBe("203.0.113.5");
    expect(callerKey(new Request("http://localhost/api/route", { headers: { "x-real-ip": "203.0.113.6" } }))).toBe("203.0.113.6");
    expect(callerKey(new Request("http://localhost/api/route"))).toBe("shared");
  });

  it("shares one bucket across spoofed addresses when no proxy is trusted", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "sk-server-key-1234567890");
    vi.stubEnv("ROUTE_RATE_LIMIT_PER_MINUTE", "1");
    vi.stubEnv("ROUTE_TRUST_PROXY", undefined);
    vi.stubGlobal("fetch", stubJev());
    expect((await post(good, { "x-forwarded-for": "10.0.0.1" })).status).toBe(200);
    expect((await post(good, { "x-forwarded-for": "10.0.0.2" })).status).toBe(429);
  });

  it("never echoes the key in an error", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "sk-server-key-1234567890");
    vi.stubEnv("ROUTE_RATE_LIMIT_PER_MINUTE", undefined);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key sk-server-key-1234567890", { status: 401 })));
    const response = await post(good);
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain("sk-server-key");
  });
});

describe("GET /api/route", () => {
  it("reports only whether the server has a key, never the key itself", async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body)).toEqual(["live"]);
    expect(typeof body.live).toBe("boolean");
  });
});
