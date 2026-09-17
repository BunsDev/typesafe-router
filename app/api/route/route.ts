/**
 * POST /api/route — run one routing decision on the server.
 * GET  /api/route — report whether a live Jev key is configured.
 *
 * Which key is used, in order:
 *   1. the `x-typesafe-api-key` header, when the user saved their own key in the UI
 *   2. `TYPESAFE_API_KEY` from `.env.local`
 *   3. neither → the keyword simulator (demo mode)
 *
 * The key is never logged and never echoed: error messages pass through
 * `redact` so a key can't leak back to the screen. This route does NOT execute
 * the chosen option: what "web_search" means is the consuming app's business,
 * and this demo only ever displays it.
 *
 * Because the endpoint is unauthenticated, every text field and the body as a
 * whole are bounded (`lib/limits.ts`), and calls that would spend the SERVER's
 * key are rate limited (`ROUTE_RATE_LIMIT_PER_MINUTE`, default 60, 0 disables).
 * Calls carrying the user's own key spend the user's credits and are not
 * limited here.
 *
 * The limit is per caller only when `ROUTE_TRUST_PROXY` is set, meaning a
 * proxy in front of this app (Vercel, nginx, a load balancer) overwrites
 * `x-forwarded-for` / `x-real-ip` with the real client address. Without it those
 * headers are whatever the client sent, so they are ignored and every caller
 * shares one bucket: coarser, but not spoofable.
 */

import { API_KEY_HEADER } from "@/lib/apiKeyStorage";
import { callJev, hasJevApiKey, JevApiError, type JevRequest } from "@/lib/jevClient";
import { createRouter, RouterConfigError } from "@/lib/jevRouter";
import {
  MAX_BODY_BYTES,
  MAX_CONTEXT_CHARS,
  MAX_INPUT_CHARS,
  MAX_OPTION_DESCRIPTION_CHARS,
  MAX_OPTION_ID_CHARS,
  MAX_OPTION_LABEL_CHARS,
  MAX_OPTIONS,
} from "@/lib/limits";
import { mockCallJev } from "@/lib/mockRouter";
import { createRateLimiter } from "@/lib/rateLimit";
import { routerConfigs } from "@/lib/routerConfigs";
import type { RouteApiError, RouteApiRequest, RouteApiResponse, RouteOption } from "@/types/router";

export const DEFAULT_SERVER_KEY_LIMIT_PER_MINUTE = 60;

/** Shared across requests in this process. Exported so tests can reset it. */
export const serverKeyLimiter = createRateLimiter(60_000);

function serverKeyLimitPerMinute(): number {
  const raw = process.env.ROUTE_RATE_LIMIT_PER_MINUTE?.trim();
  if (!raw) return DEFAULT_SERVER_KEY_LIMIT_PER_MINUTE;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_SERVER_KEY_LIMIT_PER_MINUTE;
}

const SHARED_BUCKET = "shared";

function trustProxyHeaders(): boolean {
  const raw = process.env.ROUTE_TRUST_PROXY?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Caller identity for rate limiting. With a trusted proxy the LAST
 * `x-forwarded-for` entry is the one that proxy appended (earlier entries are
 * client-supplied), then `x-real-ip`. Without one, everybody shares a bucket.
 */
export function callerKey(request: Request): string {
  if (!trustProxyHeaders()) return SHARED_BUCKET;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  return (forwarded || request.headers.get("x-real-ip")?.trim() || SHARED_BUCKET).slice(0, 100);
}

/** Strip a secret from any text that might be shown to the user. */
export function redact(text: string, secret: string | undefined): string {
  if (!secret || secret.length < 8) return text;
  return text.split(secret).join("[redacted]");
}

function fail(error: string, code: string, status: number, secret?: string): Response {
  const payload: RouteApiError = { error: redact(error, secret), code };
  return Response.json(payload, { status });
}

/** Small hand-written validator; returns an error message or null. */
export function validateBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Request body must be a JSON object.";
  const { mode, userInput, context, options, confidenceThreshold } = body as Partial<RouteApiRequest>;
  if (mode !== "model" && mode !== "tool") return '`mode` must be "model" or "tool".';
  if (typeof userInput !== "string" || userInput.trim().length === 0) return "`userInput` must be a non-empty string.";
  if (userInput.length > MAX_INPUT_CHARS) return `Input is too long (max ${MAX_INPUT_CHARS.toLocaleString()} characters).`;
  if (context !== undefined && typeof context !== "string") return "`context` must be a string when present.";
  if (context !== undefined && context.length > MAX_CONTEXT_CHARS) return `Context is too long (max ${MAX_CONTEXT_CHARS.toLocaleString()} characters).`;
  if (!Array.isArray(options) || options.length < 2) return "`options` must be an array with at least two entries.";
  if (options.length > MAX_OPTIONS) return `Too many options (max ${MAX_OPTIONS}).`;
  for (const o of options as Partial<RouteOption>[]) {
    if (!o || typeof o.id !== "string" || !o.id.trim()) return "Every option needs a non-empty `id`.";
    if (o.id.length > MAX_OPTION_ID_CHARS) return `Option id "${o.id.slice(0, 16)}…" is too long (max ${MAX_OPTION_ID_CHARS} characters).`;
    if (typeof o.label !== "string" || typeof o.description !== "string") return `Option "${o.id}" needs a \`label\` and \`description\`.`;
    if (o.label.length > MAX_OPTION_LABEL_CHARS) return `Option "${o.id}" label is too long (max ${MAX_OPTION_LABEL_CHARS} characters).`;
    if (o.description.length > MAX_OPTION_DESCRIPTION_CHARS) {
      return `Option "${o.id}" description is too long (max ${MAX_OPTION_DESCRIPTION_CHARS.toLocaleString()} characters).`;
    }
  }
  if (confidenceThreshold !== undefined && !(typeof confidenceThreshold === "number" && confidenceThreshold >= 0 && confidenceThreshold <= 1)) {
    return "`confidenceThreshold` must be a number between 0 and 1.";
  }
  return null;
}

/** Reports whether the SERVER has a key. A browser-stored key is known only to the browser. */
export async function GET(): Promise<Response> {
  return Response.json({ live: hasJevApiKey() });
}

export async function POST(request: Request): Promise<Response> {
  const tooLarge = `Request body is too large (max ${Math.round(MAX_BODY_BYTES / 1024)} KB).`;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(tooLarge, "validation", 413);

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return fail(tooLarge, "validation", 413);
    body = JSON.parse(text);
  } catch {
    return fail("Request body was not valid JSON.", "validation", 400);
  }

  const problem = validateBody(body);
  if (problem) return fail(problem, "validation", 400);

  const { mode, userInput, context, options, confidenceThreshold } = body as RouteApiRequest;
  const userKey = request.headers.get(API_KEY_HEADER)?.trim() || "";
  const serverKey = process.env.TYPESAFE_API_KEY?.trim() || "";
  const apiKey = userKey || serverKey;

  if (!userKey && serverKey && !serverKeyLimiter.allow(callerKey(request), serverKeyLimitPerMinute())) {
    return fail("Too many requests are using this server's key. Wait a minute, or add your own TypeSafe key.", "rate_limited", 429);
  }

  // Same engine either way; only the transport differs.
  const router = apiKey
    ? createRouter(routerConfigs[mode], (jevRequest: JevRequest) => callJev(jevRequest, apiKey), "jev")
    : createRouter(routerConfigs[mode], mockCallJev, "mock");

  try {
    const outcome = await router.route({ userInput, context, options }, { confidenceThreshold });
    const payload: RouteApiResponse = { result: outcome.result, logEntry: outcome.logEntry };
    return Response.json(payload);
  } catch (error) {
    if (error instanceof RouterConfigError) return fail(error.message, "config", 400, apiKey);
    if (error instanceof JevApiError) {
      const status = error.status && error.status >= 400 && error.status < 600 ? error.status : 502;
      return fail(error.message, error.code, status, apiKey);
    }
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Unexpected error while routing: ${message}`, "unknown", 500, apiKey);
  }
}
