/**
 * The router engine.
 *
 *   ┌────────────┐   RouteRequest    ┌──────────────┐   pick + scores   ┌──────────────────┐
 *   │  your app  │ ────────────────▶ │  this file   │ ◀──────────────── │  Jev (choice Q)  │
 *   │            │ ◀──────────────── │              │                   └──────────────────┘
 *   └────────────┘   ResolvedRoute   └──────────────┘
 *         │
 *         ▼  your code executes the chosen option (this library never does)
 *
 * Three guarantees, enforced here rather than merely documented:
 *
 *  1. Jev only selects from the `options` array you pass in. An answer outside
 *     that list is never treated as a route; it becomes a fallback with
 *     reason `invalid_option`.
 *  2. This module never executes a tool or calls an LLM. It has no idea how to.
 *     It returns an option id; what you do with it is your business.
 *  3. Every option list must contain the option named by the fallback policy.
 *     `assertFallbackOption` throws a `RouterConfigError` before any Jev call.
 */

import type {
  FallbackAction,
  FallbackPolicy,
  FallbackReason,
  ResolvedRoute,
  RouteDecision,
  RouteOption,
  RouteRequest,
  RouterConfig,
  RouteSource,
  RoutingLogEntry,
  RoutingLogger,
} from "@/types/router";
import { callJev, type JevChoiceAnswer, type JevRequest, type JevTransport } from "@/lib/jevClient";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;
export const ROUTER_QUESTION_ID = "router.select_option";
export const DEFAULT_CLARIFICATION_PROMPT =
  "I'm not sure which tool would help here. Could you tell me a bit more about what you're trying to do?";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** The option list or policy is misconfigured. Thrown before any network call. */
export class RouterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterConfigError";
  }
}

/** Jev returned something that is not one of the supplied option ids. */
export class RouteIntegrityError extends Error {
  readonly received: string;
  readonly scores: Record<string, number>;
  constructor(received: string, scores: Record<string, number>) {
    super(
      received
        ? `Jev returned "${received}", which is not one of the supplied option ids. Refusing to treat it as a route.`
        : "Jev returned no usable choice. Refusing to guess a route.",
    );
    this.name = "RouteIntegrityError";
    this.received = received;
    this.scores = scores;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Every option list handed to the router must include the policy's safe
 * option. Without it there is nothing safe to fall back to (model router) or
 * no way for Jev to say "no tool applies" (tool router).
 */
export function assertFallbackOption(options: RouteOption[], policy: FallbackPolicy): void {
  const requiredId = policy.kind === "safe_default" ? policy.optionId : policy.requiredOptionId;
  if (!options.some((o) => o.id === requiredId)) {
    const role = policy.kind === "safe_default" ? "safe default" : "no-tool escape hatch";
    throw new RouterConfigError(
      `Option list is missing the required ${role} option "${requiredId}". ` +
        `Every option list passed to the router must include it so a low-confidence decision can never be silently misrouted. ` +
        `Options present: [${options.map((o) => o.id).join(", ")}].`,
    );
  }
}

/** Basic structural checks on a request. Throws `RouterConfigError` on problems. */
export function assertValidRequest(request: RouteRequest): void {
  if (typeof request.userInput !== "string" || request.userInput.trim().length === 0) {
    throw new RouterConfigError("`userInput` must be a non-empty string.");
  }
  if (!Array.isArray(request.options) || request.options.length < 2) {
    throw new RouterConfigError("`options` must contain at least two options for Jev to choose between.");
  }
  const seen = new Set<string>();
  for (const option of request.options) {
    if (!option || typeof option.id !== "string" || option.id.trim().length === 0) {
      throw new RouterConfigError("Every option needs a non-empty string `id`.");
    }
    if (seen.has(option.id)) throw new RouterConfigError(`Duplicate option id "${option.id}".`);
    seen.add(option.id);
    if (typeof option.label !== "string" || typeof option.description !== "string") {
      throw new RouterConfigError(`Option "${option.id}" needs a string \`label\` and \`description\`.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Context + question construction
// ---------------------------------------------------------------------------

export function buildRouterContext(request: RouteRequest): string {
  const optionsDescription = request.options.map((o) => `- ${o.id}: ${o.label} — ${o.description}`).join("\n");
  const context = request.context?.trim();
  return (
    `Request: "${request.userInput}"\n\nOptions:\n${optionsDescription}` +
    (context ? `\n\nConversation context:\n${context}` : "")
  );
}

export function buildRouterQuestion(request: RouteRequest) {
  const optionDescriptions: Record<string, string> = {};
  for (const o of request.options) optionDescriptions[o.id] = `${o.label} — ${o.description}`;
  return {
    type: "choice" as const,
    id: ROUTER_QUESTION_ID,
    question: "Given the request, which option is the best fit?",
    options: request.options.map((o) => o.id),
    optionDescriptions,
  };
}

/** The exact `JevRequest` the router sends. Exposed so the UI can show it and tests can assert on it. */
export function buildJevRequest(request: RouteRequest): JevRequest {
  return { context: buildRouterContext(request), questions: [buildRouterQuestion(request)] };
}

// ---------------------------------------------------------------------------
// Core: ask Jev, return a RouteDecision
// ---------------------------------------------------------------------------

/** Scores for every option id in the request; ids Jev did not score get 0. */
function completeScores(options: RouteOption[], probabilities: Record<string, number> | undefined): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const o of options) scores[o.id] = probabilities?.[o.id] ?? 0;
  return scores;
}

/**
 * Ask Jev which option fits the request. Pure decision, no fallback policy
 * applied yet: `fallbackUsed` is set but `selectedOptionId` is still Jev's pick.
 *
 * Throws `RouteIntegrityError` if Jev's answer is not one of `request.options`.
 * Throws `JevApiError` on transport problems.
 */
export async function routeWithJev(
  request: RouteRequest,
  confidenceThreshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
  transport: JevTransport = callJev,
): Promise<RouteDecision> {
  assertValidRequest(request);

  const jevResponse = await transport(buildJevRequest(request));
  const answer: JevChoiceAnswer | undefined = jevResponse.find((a) => a.id === ROUTER_QUESTION_ID) ?? jevResponse[0];
  const allowedIds = new Set(request.options.map((o) => o.id));
  const scores = completeScores(request.options, answer?.optionProbabilities);

  // Guarantee 1: never treat anything outside the option list as a route.
  if (!answer || answer.needsReview || !allowedIds.has(answer.value)) {
    throw new RouteIntegrityError(answer?.value ?? "", scores);
  }

  return {
    selectedOptionId: answer.value,
    confidence: answer.confidence,
    allOptionScores: scores,
    fallbackUsed: answer.confidence < confidenceThreshold,
  };
}

// ---------------------------------------------------------------------------
// Fallback policy
// ---------------------------------------------------------------------------

function fallbackActionFor(policy: FallbackPolicy, reason: FallbackReason): FallbackAction {
  if (policy.kind === "safe_default") return { kind: "safe_default", optionId: policy.optionId, reason };
  return { kind: "needs_clarification", prompt: policy.clarificationPrompt ?? DEFAULT_CLARIFICATION_PROMPT, reason };
}

/**
 * Apply a fallback policy to a decision. Deterministic, no I/O.
 *
 * When `decision.fallbackUsed` is false the pick stands. Otherwise the policy
 * decides: route to the safe default, or hand back a clarification prompt and
 * NO option to execute.
 */
export function resolveFallback(
  decision: RouteDecision,
  options: RouteOption[],
  policy: FallbackPolicy,
  source: RouteSource,
  reason: FallbackReason = "low_confidence",
): ResolvedRoute {
  assertFallbackOption(options, policy);
  const byId = new Map(options.map((o) => [o.id, o] as const));

  if (!decision.fallbackUsed) {
    return {
      decision,
      action: { kind: "none" },
      effectiveOptionId: decision.selectedOptionId,
      effectiveOption: byId.get(decision.selectedOptionId) ?? null,
      source,
    };
  }

  const action = fallbackActionFor(policy, reason);
  const effectiveOptionId = action.kind === "safe_default" ? action.optionId : null;
  return {
    decision,
    action,
    effectiveOptionId,
    effectiveOption: effectiveOptionId ? (byId.get(effectiveOptionId) ?? null) : null,
    source,
  };
}

// ---------------------------------------------------------------------------
// Router instance: validate → ask Jev → apply policy → log
// ---------------------------------------------------------------------------

export const consoleLogger: RoutingLogger = {
  log(entry) {
    const flag = entry.fallbackUsed ? ` FALLBACK(${entry.fallbackAction.kind})` : "";
    console.info(
      `[router:${entry.mode}] ${entry.selectedOptionId} @ ${entry.confidence.toFixed(2)} (threshold ${entry.confidenceThreshold})${flag} ← "${entry.userInput.slice(0, 80)}"`,
    );
  },
};

let logCounter = 0;
function nextLogId(): string {
  logCounter += 1;
  return `${Date.now().toString(36)}-${logCounter.toString(36)}`;
}

export type RouteOutcome = { result: ResolvedRoute; logEntry: RoutingLogEntry };

export type Router = {
  readonly config: Required<Pick<RouterConfig, "mode" | "confidenceThreshold" | "fallback">>;
  /**
   * Route one request. Always resolves to a `ResolvedRoute` when Jev answers,
   * even if the answer was garbage (that becomes an `invalid_option` fallback).
   * Rejects only on transport errors (`JevApiError`) or bad configuration
   * (`RouterConfigError`).
   */
  route(request: Omit<RouteRequest, "options"> & { options: RouteOption[] }, overrides?: { confidenceThreshold?: number }): Promise<RouteOutcome>;
};

/**
 * Build a router. The model router and the tool router are two calls to this
 * with different configs (see lib/routerConfigs.ts).
 *
 * @param transport Where the question goes. Defaults to the real Jev API.
 *   Pass `mockCallJev` for demo mode, or a fake in tests.
 */
export function createRouter(config: RouterConfig, transport: JevTransport = callJev, source: RouteSource = "jev"): Router {
  const threshold = config.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  if (!(threshold >= 0 && threshold <= 1)) throw new RouterConfigError("`confidenceThreshold` must be between 0 and 1.");
  const logger = config.logger ?? consoleLogger;

  return {
    config: { mode: config.mode, confidenceThreshold: threshold, fallback: config.fallback },

    async route(request, overrides) {
      const confidenceThreshold = overrides?.confidenceThreshold ?? threshold;
      if (!(confidenceThreshold >= 0 && confidenceThreshold <= 1)) {
        throw new RouterConfigError("`confidenceThreshold` must be between 0 and 1.");
      }

      // Guarantee 3: check the safe option exists before spending a Jev call.
      assertValidRequest(request);
      assertFallbackOption(request.options, config.fallback);

      const started = Date.now();
      let decision: RouteDecision;
      let reason: FallbackReason = "low_confidence";

      try {
        decision = await routeWithJev(request, confidenceThreshold, transport);
      } catch (error) {
        if (!(error instanceof RouteIntegrityError)) throw error;
        // Guarantee 1, second half: an out-of-list answer is a fallback, never a route.
        reason = "invalid_option";
        decision = {
          selectedOptionId: "",
          confidence: 0,
          allOptionScores: error.scores,
          fallbackUsed: true,
        };
      }

      const result = resolveFallback(decision, request.options, config.fallback, source, reason);

      const logEntry: RoutingLogEntry = {
        id: nextLogId(),
        timestamp: new Date().toISOString(),
        mode: config.mode,
        userInput: request.userInput,
        context: request.context,
        optionsConsidered: request.options.map((o) => o.id),
        selectedOptionId: decision.selectedOptionId,
        effectiveOptionId: result.effectiveOptionId,
        confidence: decision.confidence,
        confidenceThreshold,
        allOptionScores: decision.allOptionScores,
        fallbackUsed: decision.fallbackUsed,
        fallbackAction: result.action,
        source,
        durationMs: Date.now() - started,
      };
      logger.log(logEntry);

      return { result, logEntry };
    },
  };
}
