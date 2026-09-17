/**
 * The two configured router instances the demo ships with.
 *
 * To add an option, append to the relevant array. The only rule: every option
 * list must still contain the fallback option named in the policy
 * (`general_model` for the model router, `no_tool_needed` for the tool router).
 * The router throws `RouterConfigError` on the first call otherwise.
 *
 * `metadata` is never sent to Jev. It's there for YOUR executor: the thing that
 * takes a `RouteDecision` and actually calls a model or runs a tool.
 */

import type { FallbackPolicy, RouteOption, RouterConfig, RouterMode } from "@/types/router";

// ---------------------------------------------------------------------------
// Model router
// ---------------------------------------------------------------------------

export const MODEL_SAFE_DEFAULT_ID = "general_model";

export const modelRouterOptions: RouteOption[] = [
  {
    id: "fast_cheap_model",
    label: "Fast, cheap model",
    description: "Simple factual questions, short answers, low-stakes requests.",
    metadata: { cost_per_1k_tokens: 0.001, avg_latency_ms: 400 },
  },
  {
    id: "reasoning_model",
    label: "Deep reasoning model",
    description: "Multi-step logic, math, complex planning, or ambiguous requests.",
    metadata: { cost_per_1k_tokens: 0.03, avg_latency_ms: 3000 },
  },
  {
    id: "code_model",
    label: "Code-specialized model",
    description: "Writing, reviewing, or debugging code.",
    metadata: { cost_per_1k_tokens: 0.015, avg_latency_ms: 1500 },
  },
  {
    id: MODEL_SAFE_DEFAULT_ID,
    label: "General model (safe default)",
    description: "Balanced general-purpose model. Used when the request doesn't clearly fit a specialist.",
    metadata: { cost_per_1k_tokens: 0.01, avg_latency_ms: 1200, role: "fallback" },
  },
];

export const modelRouterFallback: FallbackPolicy = { kind: "safe_default", optionId: MODEL_SAFE_DEFAULT_ID };

export const modelRouterConfig: RouterConfig = {
  mode: "model",
  confidenceThreshold: 0.75,
  fallback: modelRouterFallback,
};

// ---------------------------------------------------------------------------
// Tool router
// ---------------------------------------------------------------------------

export const NO_TOOL_NEEDED_ID = "no_tool_needed";

export const toolRouterOptions: RouteOption[] = [
  { id: "web_search", label: "Web search", description: "Current information, news, or facts not in the conversation." },
  { id: "calculator", label: "Calculator", description: "Arithmetic or numeric computation." },
  { id: "calendar_lookup", label: "Calendar lookup", description: "Schedule, availability, or upcoming events." },
  {
    id: NO_TOOL_NEEDED_ID,
    label: "No tool needed",
    description: "The request can be answered directly without any external tool.",
    metadata: { role: "fallback" },
  },
];

export const toolRouterFallback: FallbackPolicy = {
  kind: "needs_clarification",
  requiredOptionId: NO_TOOL_NEEDED_ID,
  clarificationPrompt: "I'm not confident which tool fits this. Could you say more about what you need — a fact lookup, a calculation, or something on your calendar?",
};

export const toolRouterConfig: RouterConfig = {
  mode: "tool",
  confidenceThreshold: 0.75,
  fallback: toolRouterFallback,
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export const routerConfigs: Record<RouterMode, RouterConfig> = {
  model: modelRouterConfig,
  tool: toolRouterConfig,
};

export const defaultOptions: Record<RouterMode, RouteOption[]> = {
  model: modelRouterOptions,
  tool: toolRouterOptions,
};

/** The option id the policy requires, per mode. The UI uses this to lock that row against deletion. */
export function requiredOptionId(mode: RouterMode): string {
  const policy = routerConfigs[mode].fallback;
  return policy.kind === "safe_default" ? policy.optionId : policy.requiredOptionId;
}
