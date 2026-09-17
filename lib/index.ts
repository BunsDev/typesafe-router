/**
 * Public surface of the router library.
 *
 *   import { createRouter, modelRouterConfig, modelRouterOptions } from "@/lib";
 *
 *   const router = createRouter(modelRouterConfig);
 *   const { result } = await router.route({ userInput, options: modelRouterOptions });
 *   if (result.effectiveOptionId) yourExecutor(result.effectiveOptionId, userInput);
 *   else askUser(result.action.kind === "needs_clarification" ? result.action.prompt : "");
 */

export * from "@/types/router";
export {
  createRouter,
  routeWithJev,
  resolveFallback,
  assertFallbackOption,
  assertValidRequest,
  buildRouterContext,
  buildRouterQuestion,
  buildJevRequest,
  consoleLogger,
  RouterConfigError,
  RouteIntegrityError,
  DEFAULT_CONFIDENCE_THRESHOLD,
  DEFAULT_CLARIFICATION_PROMPT,
  ROUTER_QUESTION_ID,
  type Router,
  type RouteOutcome,
} from "@/lib/jevRouter";
export {
  callJev,
  hasJevApiKey,
  JevApiError,
  JEV_ENDPOINT,
  DEFAULT_JEV_MODEL,
  type JevTransport,
  type JevRequest,
  type JevChoiceQuestion,
  type JevChoiceAnswer,
  type JevErrorCode,
} from "@/lib/jevClient";
export { mockCallJev, createMockTransport } from "@/lib/mockRouter";
export * from "@/lib/routerConfigs";
