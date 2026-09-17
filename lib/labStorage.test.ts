import { afterEach, describe, expect, it } from "vitest";
import { clearLabState, historyToJson, isFallbackAction, LAB_STORAGE_KEY, LAB_STORAGE_VERSION, loadLabState, MAX_HISTORY, parseLabState, saveLabState } from "@/lib/labStorage";
import { createRouter, ROUTER_QUESTION_ID } from "@/lib/jevRouter";
import { modelRouterOptions, toolRouterConfig, toolRouterOptions } from "@/lib/routerConfigs";
import { installFakeStorage, uninstallFakeStorage } from "@/lib/testing/fakeStorage";
import type { RoutingLogEntry } from "@/types/router";

afterEach(uninstallFakeStorage);

const entry: RoutingLogEntry = {
  id: "abc",
  timestamp: "2026-09-17T00:00:00.000Z",
  mode: "tool",
  userInput: "What is 2+2?",
  optionsConsidered: ["calculator", "no_tool_needed"],
  selectedOptionId: "calculator",
  effectiveOptionId: "calculator",
  confidence: 0.9,
  confidenceThreshold: 0.75,
  allOptionScores: { calculator: 0.9, no_tool_needed: 0.1 },
  fallbackUsed: false,
  fallbackAction: { kind: "none" },
  source: "mock",
  durationMs: 3,
};

describe("parseLabState", () => {
  it("accepts a well-formed blob", () => {
    const parsed = parseLabState({
      version: LAB_STORAGE_VERSION,
      optionsByMode: { model: modelRouterOptions, tool: toolRouterOptions },
      threshold: 0.6,
      history: [entry],
    });
    expect(parsed?.threshold).toBe(0.6);
    expect(parsed?.optionsByMode?.tool).toHaveLength(toolRouterOptions.length);
    expect(parsed?.history).toEqual([entry]);
  });

  it("rejects other versions and non-objects", () => {
    expect(parseLabState({ version: 99 })).toBeNull();
    expect(parseLabState("nope")).toBeNull();
    expect(parseLabState(null)).toBeNull();
  });

  it("round-trips a log entry the real router produced", async () => {
    const transport = async () => [{ id: ROUTER_QUESTION_ID, type: "choice" as const, value: "calculator", confidence: 0.4, needsReview: false }];
    const router = createRouter({ ...toolRouterConfig, logger: { log: () => {} } }, transport, "mock");
    const { logEntry } = await router.route({ userInput: "2+2", context: "earlier", options: toolRouterOptions });
    const parsed = parseLabState(JSON.parse(JSON.stringify({ version: LAB_STORAGE_VERSION, history: [logEntry] })));
    expect(parsed?.history).toEqual([logEntry]);
    expect(parsed?.history?.[0].fallbackAction.kind).toBe("needs_clarification");
  });

  it("drops entries whose fallbackAction is not a complete variant of the union", () => {
    const broken = [
      { ...entry, id: "a", fallbackUsed: true, fallbackAction: {} },
      { ...entry, id: "b", fallbackUsed: true, fallbackAction: { kind: "safe_default" } },
      { ...entry, id: "c", fallbackUsed: true, fallbackAction: { kind: "needs_clarification", reason: "low_confidence" } },
      { ...entry, id: "d", fallbackAction: { kind: "nope" } },
      { ...entry, id: "e", allOptionScores: { calculator: "0.9" } },
      { ...entry, id: "f", optionsConsidered: "calculator" },
      { ...entry, id: "g", source: "other" },
    ];
    const fine = [
      { ...entry, id: "h", fallbackUsed: true, fallbackAction: { kind: "safe_default", optionId: "general_model", reason: "low_confidence" } },
      { ...entry, id: "i", fallbackUsed: true, effectiveOptionId: null, fallbackAction: { kind: "needs_clarification", prompt: "Say more?", reason: "invalid_option" } },
    ];
    const parsed = parseLabState({ version: LAB_STORAGE_VERSION, history: [...broken, ...fine] });
    expect(parsed?.history?.map((e) => e.id)).toEqual(["h", "i"]);
    expect(isFallbackAction({ kind: "none" })).toBe(true);
    expect(isFallbackAction({ kind: "none", extra: 1 })).toBe(true);
    expect(isFallbackAction(null)).toBe(false);
  });

  it("drops malformed options and log entries but keeps the rest", () => {
    const parsed = parseLabState({
      version: LAB_STORAGE_VERSION,
      optionsByMode: { model: [...modelRouterOptions, { id: 42 }], tool: toolRouterOptions },
      threshold: 7,
      history: [entry, { id: "broken" }],
    });
    expect(parsed?.optionsByMode?.model).toHaveLength(modelRouterOptions.length);
    expect(parsed?.threshold).toBeUndefined();
    expect(parsed?.history).toEqual([entry]);
  });
});

describe("load / save / clear", () => {
  it("is a safe no-op without a window", () => {
    expect(loadLabState()).toBeNull();
    expect(saveLabState({ optionsByMode: { model: modelRouterOptions, tool: toolRouterOptions }, threshold: 0.5, history: [] })).toBe(false);
    expect(() => clearLabState()).not.toThrow();
  });

  it("round-trips options, threshold and history through storage", () => {
    installFakeStorage();
    const state = { optionsByMode: { model: modelRouterOptions, tool: toolRouterOptions }, threshold: 0.6, history: [entry] };
    expect(saveLabState(state)).toBe(true);
    expect(loadLabState()).toEqual({ version: LAB_STORAGE_VERSION, ...state });
  });

  it("keeps only the newest MAX_HISTORY entries when saving", () => {
    installFakeStorage();
    const history = Array.from({ length: MAX_HISTORY + 25 }, (_, i) => ({ ...entry, id: `e${i}` }));
    saveLabState({ optionsByMode: { model: modelRouterOptions, tool: toolRouterOptions }, threshold: 0.75, history });
    const loaded = loadLabState();
    expect(loaded?.history).toHaveLength(MAX_HISTORY);
    expect(loaded?.history?.[0].id).toBe("e0");
  });

  it("clears the stored blob", () => {
    const store = installFakeStorage();
    saveLabState({ optionsByMode: { model: modelRouterOptions, tool: toolRouterOptions }, threshold: 0.75, history: [entry] });
    expect(store.has(LAB_STORAGE_KEY)).toBe(true);
    clearLabState();
    expect(store.has(LAB_STORAGE_KEY)).toBe(false);
    expect(loadLabState()).toBeNull();
  });

  it("returns null for corrupt JSON and reports failure when storage throws", () => {
    const store = installFakeStorage();
    store.set(LAB_STORAGE_KEY, "{not json");
    expect(loadLabState()).toBeNull();

    installFakeStorage({ throwing: true });
    expect(loadLabState()).toBeNull();
    expect(saveLabState({ optionsByMode: { model: modelRouterOptions, tool: toolRouterOptions }, threshold: 0.75, history: [] })).toBe(false);
    expect(() => clearLabState()).not.toThrow();
  });
});

describe("historyToJson", () => {
  it("wraps the decisions with a count and timestamp", () => {
    const json = JSON.parse(historyToJson([entry]));
    expect(json.count).toBe(1);
    expect(json.decisions[0].selectedOptionId).toBe("calculator");
    expect(typeof json.exportedAt).toBe("string");
  });
});
