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
 */

import { API_KEY_HEADER } from "@/lib/apiKeyStorage";
import { callJev, hasJevApiKey, JevApiError, type JevRequest } from "@/lib/jevClient";
import { createRouter, RouterConfigError } from "@/lib/jevRouter";
import { mockCallJev } from "@/lib/mockRouter";
import { routerConfigs } from "@/lib/routerConfigs";
import type { RouteApiError, RouteApiRequest, RouteApiResponse, RouteOption } from "@/types/router";

const MAX_INPUT_CHARS = 20_000;
const MAX_OPTIONS = 32;

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
  if (!Array.isArray(options) || options.length < 2) return "`options` must be an array with at least two entries.";
  if (options.length > MAX_OPTIONS) return `Too many options (max ${MAX_OPTIONS}).`;
  for (const o of options as Partial<RouteOption>[]) {
    if (!o || typeof o.id !== "string" || !o.id.trim()) return "Every option needs a non-empty `id`.";
    if (typeof o.label !== "string" || typeof o.description !== "string") return `Option "${o.id}" needs a \`label\` and \`description\`.`;
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Request body was not valid JSON.", "validation", 400);
  }

  const problem = validateBody(body);
  if (problem) return fail(problem, "validation", 400);

  const { mode, userInput, context, options, confidenceThreshold } = body as RouteApiRequest;
  const userKey = request.headers.get(API_KEY_HEADER)?.trim() || "";
  const apiKey = userKey || process.env.TYPESAFE_API_KEY?.trim() || "";

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
