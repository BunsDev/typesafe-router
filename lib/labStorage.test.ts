import { describe, expect, it } from "vitest";
import { historyToJson, LAB_STORAGE_VERSION, parseLabState } from "@/lib/labStorage";
import { modelRouterOptions, toolRouterOptions } from "@/lib/routerConfigs";
import type { RoutingLogEntry } from "@/types/router";

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

describe("historyToJson", () => {
  it("wraps the decisions with a count and timestamp", () => {
    const json = JSON.parse(historyToJson([entry]));
    expect(json.count).toBe(1);
    expect(json.decisions[0].selectedOptionId).toBe("calculator");
    expect(typeof json.exportedAt).toBe("string");
  });
});
