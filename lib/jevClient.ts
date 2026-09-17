/**
 * Low-level wrapper around TypeSafe's Jev API.
 *
 * Jev is not a text generator. You send it a piece of "state" plus typed
 * questions and it answers with structured values and probabilities. This
 * router only ever asks ONE kind of question — `choice` — and only ever reads
 * back a pick from the option list plus per-option probabilities.
 *
 * Server-side only: it reads `TYPESAFE_API_KEY` from the environment, so it
 * must be called from an API route (see `app/api/route/route.ts`), never from
 * browser code.
 *
 * Wire format (https://docs.typesafe.ai/api):
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <key>
 *   { "state": "<text>", "model": "jev-latest", "questions": { "<id>": {...} } }
 *
 * Choice question:
 *   { "type": "choice", "instructions": "...", "criteria": { "<option>": "<description>" } }
 *
 * Choice answer:
 *   { "type": "choice", "choice": "web_search", "probabilities": {...}, "confidence": 0.91 }
 */

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const DEFAULT_JEV_MODEL = "jev-latest";
const TIMEOUT_MS = 20_000;

// ---------------------------------------------------------------------------
// Friendly request / answer shapes used by the router
// ---------------------------------------------------------------------------

export type JevChoiceQuestion = {
  type: "choice";
  /** Unique key so the answer can be matched back. */
  id: string;
  question: string;
  /** The closed set of option keys Jev must choose between. */
  options: string[];
  /** One-line description per option key; sent to Jev as the `criteria` map. */
  optionDescriptions?: Record<string, string>;
};

export type JevRequest = {
  /** The text Jev evaluates. Jev calls this "state". */
  context: string;
  questions: JevChoiceQuestion[];
};

export type JevChoiceAnswer = {
  id: string;
  type: "choice";
  /** The chosen option key. Empty string when Jev's answer was missing or not in the option list. */
  value: string;
  /** 0–1 probability for every option key Jev reported. */
  optionProbabilities?: Record<string, number>;
  /** 0–1. From Jev directly; falls back to the winning option's probability if absent. */
  confidence: number;
  /** True when the answer was missing, malformed, or outside the option list. */
  needsReview: boolean;
};

/**
 * Anything that turns a `JevRequest` into answers. `callJev` is the real one;
 * `mockCallJev` (lib/mockRouter.ts) is the demo-mode stand-in; tests inject fakes.
 */
export type JevTransport = (request: JevRequest) => Promise<JevChoiceAnswer[]>;

export type JevErrorCode =
  | "rate_limited"
  | "auth"
  | "billing"
  | "validation"
  | "overloaded"
  | "timeout"
  | "network"
  | "bad_response"
  | "unknown";

export class JevApiError extends Error {
  code: JevErrorCode;
  status?: number;
  raw?: string;

  constructor(message: string, code: JevErrorCode, status?: number, raw?: string) {
    super(message);
    this.name = "JevApiError";
    this.code = code;
    this.status = status;
    this.raw = raw;
  }
}

// ---------------------------------------------------------------------------
// Wire conversion
// ---------------------------------------------------------------------------

type WireChoiceQuestion = { type: "choice"; instructions: string; criteria: Record<string, string> };

type WireAnswer = {
  type?: string;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
};

type WireResponse = {
  answers?: Record<string, WireAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

export function toWireRequest(
  request: JevRequest,
  model: string = process.env.JEV_MODEL?.trim() || DEFAULT_JEV_MODEL,
): { state: string; model: string; questions: Record<string, WireChoiceQuestion> } {
  const questions: Record<string, WireChoiceQuestion> = {};
  for (const question of request.questions) {
    const criteria: Record<string, string> = {};
    for (const option of question.options) {
      criteria[option] = question.optionDescriptions?.[option] ?? option;
    }
    questions[question.id] = { type: "choice", instructions: question.question, criteria };
  }
  return { state: request.context, model, questions };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Turn Jev's raw answers into `JevChoiceAnswer`s. Never throws on a single bad
 * answer: a missing, malformed, or out-of-list choice becomes `needsReview: true`
 * with an empty `value`, so the router can apply its fallback policy instead of
 * crashing (and, crucially, instead of treating free text as a route).
 */
export function normalizeAnswers(request: JevRequest, body: WireResponse): JevChoiceAnswer[] {
  const answers = body.answers ?? {};

  return request.questions.map((question) => {
    const raw = answers[question.id];
    const choice = raw?.choice;
    const probabilities = sanitizeProbabilities(raw?.probabilities, question.options);
    const validChoice = typeof choice === "string" && question.options.includes(choice);

    if (!validChoice) {
      return { id: question.id, type: "choice", value: "", optionProbabilities: probabilities, confidence: 0, needsReview: true };
    }

    const confidence = isFiniteNumber(raw?.confidence)
      ? clamp01(raw.confidence)
      : isFiniteNumber(probabilities?.[choice])
        ? probabilities[choice]
        : null;

    return {
      id: question.id,
      type: "choice",
      value: choice,
      optionProbabilities: probabilities,
      confidence: confidence ?? 0,
      needsReview: confidence === null,
    };
  });
}

/** Keep only probabilities for known option keys, clamped to 0–1. */
function sanitizeProbabilities(
  raw: Record<string, number> | undefined,
  options: string[],
): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const option of options) {
    const p = raw[option];
    if (isFiniteNumber(p)) out[option] = clamp01(p);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function describeHttpError(status: number, raw: string): JevApiError {
  switch (status) {
    case 429:
      return new JevApiError("Jev rate limit hit. Try again in a moment.", "rate_limited", status, raw);
    case 401:
    case 403:
      return new JevApiError("TypeSafe rejected the API key. Check the key saved in this browser, or the server's TYPESAFE_API_KEY.", "auth", status, raw);
    case 402:
      return new JevApiError("Your TypeSafe organization has no API credits.", "billing", status, raw);
    case 400:
    case 422:
      return new JevApiError("TypeSafe rejected the request as invalid.", "validation", status, raw);
    case 503:
    case 529:
      return new JevApiError("TypeSafe is overloaded right now. Try again shortly.", "overloaded", status, raw);
    default:
      return new JevApiError(`TypeSafe API returned HTTP ${status}.`, "unknown", status, raw);
  }
}

// ---------------------------------------------------------------------------
// The real call
// ---------------------------------------------------------------------------

/**
 * Send one request to Jev and return normalized answers.
 *
 * @param apiKey Defaults to `TYPESAFE_API_KEY`. Throws a `JevApiError("auth")` when empty.
 */
export async function callJev(
  request: JevRequest,
  apiKey: string | undefined = process.env.TYPESAFE_API_KEY,
): Promise<JevChoiceAnswer[]> {
  apiKey = apiKey?.trim();
  if (!apiKey) throw new JevApiError("No TypeSafe API key available.", "auth");
  if (request.questions.length === 0) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(toWireRequest(request)),
      signal: controller.signal,
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    throw new JevApiError(
      isAbort ? "The request to TypeSafe timed out." : "Could not reach the TypeSafe API.",
      isAbort ? "timeout" : "network",
      undefined,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  if (!response.ok) throw describeHttpError(response.status, rawText);

  let body: WireResponse;
  try {
    body = JSON.parse(rawText) as WireResponse;
  } catch {
    throw new JevApiError("TypeSafe returned a response that wasn't valid JSON.", "bad_response", response.status, rawText);
  }

  return normalizeAnswers(request, body);
}

/** True when a server-side key is configured. Used by the API route to pick live vs. demo mode. */
export function hasJevApiKey(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}
