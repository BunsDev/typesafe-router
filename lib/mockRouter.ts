/**
 * Demo-mode stand-in for the Jev API.
 *
 * When no `TYPESAFE_API_KEY` is configured the app routes through this instead.
 * It is a plain keyword matcher: each option is scored by how many of its
 * keywords appear in the request, the scores are turned into probabilities, and
 * the top option wins with confidence equal to its probability.
 *
 * It is deliberately dumb and deterministic. It exists so the UI, the fallback
 * logic, and the logging can be exercised without a key. It is NOT Jev and the
 * UI labels it as such. Because it implements `JevTransport`, the router engine
 * runs exactly the same code path in demo mode as it does against the live API.
 */

import { readOwn, type JevChoiceAnswer, type JevRequest, type JevTransport } from "@/lib/jevClient";

/**
 * Hand-written keyword hints for the option ids shipped in `routerConfigs.ts`.
 * Options the user adds in the UI are scored purely from the words in their
 * label and description, which is weaker but still deterministic.
 */
const KEYWORD_HINTS: Record<string, string[]> = {
  // model router
  fast_cheap_model: ["what is", "who is", "define", "capital of", "how many", "quick", "short", "simple", "hello", "hi", "thanks", "yes or no", "spell", "translate"],
  reasoning_model: ["why", "explain", "plan", "strategy", "prove", "step by step", "trade-off", "tradeoff", "compare", "analyze", "analyse", "reason", "decide", "should i", "design", "architecture", "complex", "puzzle", "logic", "optimal", "estimate"],
  code_model: ["code", "function", "bug", "debug", "typescript", "javascript", "python", "rust", "go ", "sql", "regex", "refactor", "compile", "error", "stack trace", "unit test", "class", "api", "endpoint", "npm", "git", "```", "=>", "const ", "def ", "import "],
  general_model: [],
  // tool router
  web_search: ["latest", "news", "today", "current", "recent", "right now", "this week", "who won", "price of", "weather", "search", "look up", "lookup", "google", "headline", "stock", "score", "release date", "2025", "2026"],
  calculator: ["calculate", "compute", "sum", "total", "percent", "%", "+", "-", "*", "/", "×", "÷", "sqrt", "square root", "multiply", "divide", "add", "subtract", "average", "mean", "how much is", "times", "plus", "minus"],
  calendar_lookup: ["calendar", "schedule", "meeting", "appointment", "free", "busy", "available", "availability", "tomorrow", "next week", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "am i free", "what time", "event", "book", "reschedule"],
  no_tool_needed: ["explain", "what does", "define", "tell me about", "how do i", "write", "summarize", "summarise", "rewrite", "draft", "poem", "story", "joke", "opinion", "recommend", "difference between", "meaning of"],
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "in", "on", "is", "are", "be", "use", "when", "with", "not", "that", "this", "it", "as", "by", "from", "at", "you", "your", "user", "needs", "need", "request", "can", "any", "no", "best",
]);

export type MockOptions = {
  /** Fake latency so the loading state is visible. Default 0. */
  delayMs?: number;
  /** Softmax temperature. Lower = sharper probabilities. Must be a positive finite number. Default 0.8. */
  temperature?: number;
};

const DEFAULT_TEMPERATURE = 0.8;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%+*/×÷$-]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Pull the `Request: "..."` line the router puts at the top of the context.
 * The router JSON-encodes the request, so the line holds no raw newlines and
 * the string ends at the first unescaped quote: text inside the request cannot
 * masquerade as the "Options:" section and truncate what the simulator sees.
 */
function extractRequestText(context: string): string {
  const match = context.match(/^Request: ("(?:[^"\\\n]|\\.)*")/);
  if (match) {
    try {
      return String(JSON.parse(match[1])).toLowerCase();
    } catch {
      // Not a JSON string after all; score the whole context instead.
    }
  }
  return context.toLowerCase();
}

/** Pull the optional "Conversation context:" block, so prior turns can nudge the pick. */
function extractConversation(context: string): string {
  const match = context.match(/\n\nConversation context:\n([\s\S]*)$/);
  return match ? match[1].toLowerCase() : "";
}

function scoreOption(optionId: string, description: string | undefined, requestText: string, requestTokens: Set<string>, conversation = ""): number {
  let score = 0;

  for (const hint of readOwn(KEYWORD_HINTS, optionId) ?? []) {
    if (requestText.includes(hint)) score += hint.length > 3 ? 2 : 1;
    // Prior turns count for half: they set the topic but the request decides.
    else if (conversation && conversation.includes(hint)) score += hint.length > 3 ? 1 : 0.5;
  }

  // Overlap between the option's own words (id, label, description) and the request.
  const optionWords = new Set([...tokenize(optionId.replace(/_/g, " ")), ...tokenize(description ?? "")]);
  for (const word of optionWords) {
    if (requestTokens.has(word)) score += 1.5;
  }

  // Digits and operators are a strong calculator signal.
  if (optionId === "calculator" && /\d\s*[-+*/×÷^%]\s*\d/.test(requestText)) score += 4;
  // Long, multi-clause requests lean toward reasoning.
  if (optionId === "reasoning_model" && requestText.length > 160) score += 1.5;
  // Short questions lean toward the cheap model.
  if (optionId === "fast_cheap_model" && requestText.length < 40) score += 1;

  return score;
}

function softmax(scores: number[], temperature: number): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / temperature));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function createMockTransport(options: MockOptions = {}): JevTransport {
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  if (!(Number.isFinite(temperature) && temperature > 0)) {
    // 0 would divide by zero in softmax and hand back NaN probabilities.
    throw new RangeError(`Mock temperature must be a positive finite number, got ${String(options.temperature)}.`);
  }
  return async (request: JevRequest): Promise<JevChoiceAnswer[]> => {
    if (options.delayMs && options.delayMs > 0) await new Promise((r) => setTimeout(r, options.delayMs));

    const requestText = extractRequestText(request.context);
    const requestTokens = new Set(tokenize(requestText));
    const conversation = extractConversation(request.context);

    return request.questions.map((question) => {
      const raw = question.options.map((id) => scoreOption(id, readOwn(question.optionDescriptions, id), requestText, requestTokens, conversation));
      const probs = softmax(raw, temperature);

      let winner = question.options[0];
      let winnerP = -1;
      const optionProbabilities: Record<string, number> = Object.fromEntries(
        question.options.map((id, i) => {
          const p = Math.round(probs[i] * 1000) / 1000;
          if (p > winnerP) {
            winnerP = p;
            winner = id;
          }
          return [id, p];
        }),
      );

      return {
        id: question.id,
        type: "choice",
        value: winner,
        optionProbabilities,
        confidence: winnerP,
        needsReview: false,
      };
    });
  };
}

/** Default mock transport: no delay, temperature 0.8. */
export const mockCallJev: JevTransport = createMockTransport();
