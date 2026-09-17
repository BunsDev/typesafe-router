/**
 * Public types for the Jev Tool & Model Router.
 *
 * The boundary this library enforces, in one sentence:
 *
 *   Jev DECIDES which of a fixed list of options fits a request.
 *   Your code EXECUTES that choice.
 *
 * Nothing in these types carries a tool result, a model completion, or any
 * free-form text produced by Jev. A `RouteDecision` is a pointer into the
 * `options` array you supplied plus the scores that justify it, nothing more.
 */

/** One thing the router may pick: a model, an API key, a tool, or a "do nothing" escape hatch. */
export type RouteOption = {
  /** Stable identifier. This is the only value Jev is allowed to return. */
  id: string;
  /** Human-readable name shown in UIs and logs. */
  label: string;
  /** What this option is best used for. Jev reads this to score the option. */
  description: string;
  /** Free-form data your executor may want, e.g. cost_per_1k_tokens, avg_latency_ms. Never read by Jev. */
  metadata?: Record<string, string | number>;
};

/** What the caller wants routed. */
export type RouteRequest = {
  userInput: string;
  /** Recent conversation history or other context, if relevant. */
  context?: string;
  /** The closed set Jev must choose from. */
  options: RouteOption[];
};

/**
 * What Jev decided. `selectedOptionId` is guaranteed to be one of the ids in
 * `RouteRequest.options` — the router throws `RouteIntegrityError` otherwise.
 */
export type RouteDecision = {
  selectedOptionId: string;
  /** 0–1. Jev's own confidence in the pick. */
  confidence: number;
  /** 0–1 probability for every option id in the request (missing ones are 0). */
  allOptionScores: Record<string, number>;
  /** True when `confidence` fell below the configured threshold. */
  fallbackUsed: boolean;
};

export type RouterMode = "model" | "tool";

/**
 * What to do when the router refuses to trust Jev's top pick.
 *
 * - `safe_default`        — route to a known-safe option instead (model router).
 * - `needs_clarification` — do not pick anything; ask the user a follow-up (tool router).
 *
 * Both policies name an option that MUST be present in every option list the
 * router sees. `assertFallbackOption` throws if it is missing.
 */
export type FallbackPolicy =
  | { kind: "safe_default"; optionId: string }
  | { kind: "needs_clarification"; requiredOptionId: string; clarificationPrompt?: string };

/** The concrete action the router resolved after applying the policy. */
export type FallbackAction =
  | { kind: "none" }
  | { kind: "safe_default"; optionId: string; reason: FallbackReason }
  | { kind: "needs_clarification"; prompt: string; reason: FallbackReason };

/** Why a fallback was triggered. */
export type FallbackReason =
  | "low_confidence"
  /** Jev returned an id that is not in the option list (or nothing at all). */
  | "invalid_option";

/**
 * A `RouteDecision` after the fallback policy has been applied.
 *
 * `effectiveOptionId` is what your executor should act on. It is `null` only
 * when the action is `needs_clarification` — there is deliberately nothing to
 * execute in that case.
 */
export type ResolvedRoute = {
  decision: RouteDecision;
  action: FallbackAction;
  effectiveOptionId: string | null;
  /** The option object for `effectiveOptionId`, for convenience. */
  effectiveOption: RouteOption | null;
  /** Whether the scores came from the live Jev API or the local keyword simulator. */
  source: RouteSource;
};

export type RouteSource = "jev" | "mock";

/** One line in the routing log. Every call to `Router.route` produces exactly one. */
export type RoutingLogEntry = {
  id: string;
  /** ISO 8601. */
  timestamp: string;
  mode: RouterMode;
  userInput: string;
  context?: string;
  optionsConsidered: string[];
  selectedOptionId: string;
  effectiveOptionId: string | null;
  confidence: number;
  confidenceThreshold: number;
  allOptionScores: Record<string, number>;
  fallbackUsed: boolean;
  fallbackAction: FallbackAction;
  source: RouteSource;
  durationMs: number;
};

/** Where log entries go. The default logger writes to `console`. */
export interface RoutingLogger {
  log(entry: RoutingLogEntry): void;
}

/** Configuration for one router instance (the model router and the tool router are two of these). */
export type RouterConfig = {
  mode: RouterMode;
  /** Confidence below this triggers the fallback policy. Default 0.75. */
  confidenceThreshold?: number;
  fallback: FallbackPolicy;
  logger?: RoutingLogger;
};

/** Body accepted by the demo app's `POST /api/route`. */
export type RouteApiRequest = {
  mode: RouterMode;
  userInput: string;
  context?: string;
  options: RouteOption[];
  confidenceThreshold?: number;
};

/** Body returned by the demo app's `POST /api/route`. */
export type RouteApiResponse = {
  result: ResolvedRoute;
  logEntry: RoutingLogEntry;
};

export type RouteApiError = {
  error: string;
  code: string;
};
