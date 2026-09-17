import { describe, expect, it, vi } from "vitest";
import type { JevChoiceAnswer, JevRequest, JevTransport } from "@/lib/jevClient";
import {
  assertFallbackOption,
  buildJevRequest,
  buildRouterContext,
  createRouter,
  resolveFallback,
  RouteIntegrityError,
  RouterConfigError,
  routeWithJev,
  ROUTER_QUESTION_ID,
} from "@/lib/jevRouter";
import { modelRouterConfig, modelRouterOptions, toolRouterConfig, toolRouterOptions } from "@/lib/routerConfigs";
import type { RouteRequest, RoutingLogEntry } from "@/types/router";

function fakeTransport(answer: Partial<JevChoiceAnswer>): JevTransport & { calls: JevRequest[] } {
  const calls: JevRequest[] = [];
  const transport = (async (request: JevRequest) => {
    calls.push(request);
    return [
      {
        id: ROUTER_QUESTION_ID,
        type: "choice" as const,
        value: "",
        confidence: 0,
        needsReview: false,
        ...answer,
      },
    ];
  }) as JevTransport & { calls: JevRequest[] };
  transport.calls = calls;
  return transport;
}

const toolRequest: RouteRequest = { userInput: "What's the weather in Lisbon right now?", options: toolRouterOptions };
const silentLogger = { log: vi.fn() };

describe("buildRouterContext / buildJevRequest", () => {
  it("lists every option id with its label and description", () => {
    const context = buildRouterContext(toolRequest);
    expect(context).toContain('Request: "What\'s the weather in Lisbon right now?"');
    for (const o of toolRouterOptions) expect(context).toContain(`- ${o.id}: ${o.label} — ${o.description}`);
  });

  it("appends conversation context only when present", () => {
    expect(buildRouterContext(toolRequest)).not.toContain("Conversation context");
    expect(buildRouterContext({ ...toolRequest, context: "earlier: hi" })).toContain("Conversation context:\nearlier: hi");
  });

  it("sends exactly one choice question whose options are the option ids", () => {
    const jevRequest = buildJevRequest(toolRequest);
    expect(jevRequest.questions).toHaveLength(1);
    expect(jevRequest.questions[0].type).toBe("choice");
    expect(jevRequest.questions[0].options).toEqual(toolRouterOptions.map((o) => o.id));
  });
});

describe("routeWithJev", () => {
  it("returns Jev's pick, confidence, and a score for every option", async () => {
    const transport = fakeTransport({
      value: "web_search",
      confidence: 0.91,
      optionProbabilities: { web_search: 0.9, calculator: 0.05 },
    });
    const decision = await routeWithJev(toolRequest, 0.75, transport);
    expect(decision.selectedOptionId).toBe("web_search");
    expect(decision.confidence).toBe(0.91);
    expect(decision.fallbackUsed).toBe(false);
    // ids Jev didn't score are filled with 0, and nothing outside the list leaks in
    expect(Object.keys(decision.allOptionScores).sort()).toEqual(toolRouterOptions.map((o) => o.id).sort());
    expect(decision.allOptionScores.calendar_lookup).toBe(0);
  });

  it("flags fallbackUsed when confidence is below the threshold", async () => {
    const transport = fakeTransport({ value: "calculator", confidence: 0.6 });
    const decision = await routeWithJev(toolRequest, 0.75, transport);
    expect(decision.selectedOptionId).toBe("calculator");
    expect(decision.fallbackUsed).toBe(true);
  });

  it("refuses to treat an out-of-list answer as a route", async () => {
    const transport = fakeTransport({ value: "send_email", confidence: 0.99 });
    await expect(routeWithJev(toolRequest, 0.75, transport)).rejects.toBeInstanceOf(RouteIntegrityError);
  });

  it("refuses answers flagged needsReview", async () => {
    const transport = fakeTransport({ value: "web_search", confidence: 0.99, needsReview: true });
    await expect(routeWithJev(toolRequest, 0.75, transport)).rejects.toBeInstanceOf(RouteIntegrityError);
  });

  it("rejects an empty input or a single-option list before calling Jev", async () => {
    const transport = fakeTransport({ value: "web_search", confidence: 0.9 });
    await expect(routeWithJev({ ...toolRequest, userInput: "  " }, 0.75, transport)).rejects.toBeInstanceOf(RouterConfigError);
    await expect(routeWithJev({ ...toolRequest, options: [toolRouterOptions[0]] }, 0.75, transport)).rejects.toBeInstanceOf(RouterConfigError);
    expect(transport.calls).toHaveLength(0);
  });
});

describe("assertFallbackOption", () => {
  it("throws a clear error when the safe option is missing", () => {
    const withoutNoTool = toolRouterOptions.filter((o) => o.id !== "no_tool_needed");
    expect(() => assertFallbackOption(withoutNoTool, toolRouterConfig.fallback)).toThrow(/missing the required no-tool escape hatch option "no_tool_needed"/);

    const withoutGeneral = modelRouterOptions.filter((o) => o.id !== "general_model");
    expect(() => assertFallbackOption(withoutGeneral, modelRouterConfig.fallback)).toThrow(/missing the required safe default option "general_model"/);
  });

  it("passes when present", () => {
    expect(() => assertFallbackOption(toolRouterOptions, toolRouterConfig.fallback)).not.toThrow();
    expect(() => assertFallbackOption(modelRouterOptions, modelRouterConfig.fallback)).not.toThrow();
  });
});

describe("resolveFallback", () => {
  const lowConfidence = { selectedOptionId: "reasoning_model", confidence: 0.4, allOptionScores: {}, fallbackUsed: true };

  it("keeps the pick when no fallback is needed", () => {
    const resolved = resolveFallback({ ...lowConfidence, confidence: 0.9, fallbackUsed: false }, modelRouterOptions, modelRouterConfig.fallback, "jev");
    expect(resolved.action).toEqual({ kind: "none" });
    expect(resolved.effectiveOptionId).toBe("reasoning_model");
  });

  it("model router: routes to the safe default", () => {
    const resolved = resolveFallback(lowConfidence, modelRouterOptions, modelRouterConfig.fallback, "jev");
    expect(resolved.action).toEqual({ kind: "safe_default", optionId: "general_model", reason: "low_confidence" });
    expect(resolved.effectiveOptionId).toBe("general_model");
    expect(resolved.effectiveOption?.label).toContain("General model");
  });

  it("tool router: asks for clarification and gives nothing to execute", () => {
    const resolved = resolveFallback({ ...lowConfidence, selectedOptionId: "calculator" }, toolRouterOptions, toolRouterConfig.fallback, "jev");
    expect(resolved.action.kind).toBe("needs_clarification");
    expect(resolved.effectiveOptionId).toBeNull();
    expect(resolved.effectiveOption).toBeNull();
  });
});

describe("createRouter", () => {
  it("throws before calling Jev when the option list lacks the fallback option", async () => {
    const transport = fakeTransport({ value: "web_search", confidence: 0.9 });
    const router = createRouter({ ...toolRouterConfig, logger: silentLogger }, transport);
    const options = toolRouterOptions.filter((o) => o.id !== "no_tool_needed");
    await expect(router.route({ userInput: "hi", options })).rejects.toBeInstanceOf(RouterConfigError);
    expect(transport.calls).toHaveLength(0);
  });

  it("turns an out-of-list answer into an invalid_option fallback instead of a route", async () => {
    const transport = fakeTransport({ value: "totally_made_up", confidence: 0.99, optionProbabilities: { web_search: 0.2 } });
    const router = createRouter({ ...modelRouterConfig, logger: silentLogger }, transport);
    const { result, logEntry } = await router.route({ userInput: "anything", options: modelRouterOptions });
    expect(result.decision.selectedOptionId).toBe("");
    expect(result.decision.fallbackUsed).toBe(true);
    expect(result.action).toEqual({ kind: "safe_default", optionId: "general_model", reason: "invalid_option" });
    expect(result.effectiveOptionId).toBe("general_model");
    expect(logEntry.fallbackAction.kind).toBe("safe_default");
  });

  it("logs every decision with input, options, selection, confidence and fallback flag", async () => {
    const entries: RoutingLogEntry[] = [];
    const transport = fakeTransport({ value: "code_model", confidence: 0.88, optionProbabilities: { code_model: 0.88 } });
    const router = createRouter({ ...modelRouterConfig, logger: { log: (e) => entries.push(e) } }, transport);
    await router.route({ userInput: "fix this bug", options: modelRouterOptions });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      mode: "model",
      userInput: "fix this bug",
      optionsConsidered: modelRouterOptions.map((o) => o.id),
      selectedOptionId: "code_model",
      effectiveOptionId: "code_model",
      confidence: 0.88,
      confidenceThreshold: 0.75,
      fallbackUsed: false,
      source: "jev",
    });
  });

  it("honours a per-call threshold override", async () => {
    const transport = fakeTransport({ value: "code_model", confidence: 0.8 });
    const router = createRouter({ ...modelRouterConfig, logger: silentLogger }, transport);
    const strict = await router.route({ userInput: "fix this bug", options: modelRouterOptions }, { confidenceThreshold: 0.95 });
    expect(strict.result.decision.fallbackUsed).toBe(true);
    expect(strict.result.effectiveOptionId).toBe("general_model");
    const lax = await router.route({ userInput: "fix this bug", options: modelRouterOptions }, { confidenceThreshold: 0.5 });
    expect(lax.result.effectiveOptionId).toBe("code_model");
  });
});
