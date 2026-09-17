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

import type { JevChoiceAnswer, JevRequest, JevTransport } from "@/lib/jevClient";

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
  /** Softmax temperature. Lower = sharper probabilities. Default 0.8. */
  temperature?: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9%+*/×÷$-]+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Pull the "Request: "..."" line the router puts at the top of the context. */
function extractRequestText(context: string): string {
  const match = context.match(/^Request:\s*"([\s\S]*?)"\s*\n\nOptions:/);
  return (match ? match[1] : context).toLowerCase();
}

function scoreOption(optionId: string, description: string | undefined, requestText: string, requestTokens: Set<string>): number {
  let score = 0;

  for (const hint of KEYWORD_HINTS[optionId] ?? []) {
    if (requestText.includes(hint)) score += hint.length > 3 ? 2 : 1;
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
  const temperature = options.temperature ?? 0.8;
  return async (request: JevRequest): Promise<JevChoiceAnswer[]> => {
    if (options.delayMs && options.delayMs > 0) await new Promise((r) => setTimeout(r, options.delayMs));

    const requestText = extractRequestText(request.context);
    const requestTokens = new Set(tokenize(requestText));

    return request.questions.map((question) => {
      const raw = question.options.map((id) => scoreOption(id, question.optionDescriptions?.[id], requestText, requestTokens));
      const probs = softmax(raw, temperature);

      const optionProbabilities: Record<string, number> = {};
      let winner = question.options[0];
      let winnerP = -1;
      question.options.forEach((id, i) => {
        const p = Math.round(probs[i] * 1000) / 1000;
        optionProbabilities[id] = p;
        if (p > winnerP) {
          winnerP = p;
          winner = id;
        }
      });

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
