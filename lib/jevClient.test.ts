import { describe, expect, it } from "vitest";
import { normalizeAnswers, toWireRequest, type JevRequest } from "@/lib/jevClient";

const request: JevRequest = {
  context: "Request: \"hi\"\n\nOptions:\n- a: A — first\n- b: B — second",
  questions: [{ type: "choice", id: "q", question: "Which?", options: ["a", "b"], optionDescriptions: { a: "A — first", b: "B — second" } }],
};

describe("toWireRequest", () => {
  it("keeps prototype-named option ids in the closed set", () => {
    const wire = toWireRequest(
      { context: "x", questions: [{ type: "choice", id: "q", question: "Which?", options: ["__proto__", "constructor", "b"], optionDescriptions: { b: "B" } }] },
      "jev-latest",
    );
    const criteria = wire.questions.q.criteria;
    expect(Object.keys(criteria)).toEqual(["__proto__", "constructor", "b"]);
    expect(Object.hasOwn(criteria, "__proto__")).toBe(true);
    expect(criteria.constructor).toBe("constructor");
    expect(JSON.parse(JSON.stringify(wire)).questions.q.criteria.b).toBe("B");
  });

  it("converts to TypeSafe's keyed-map format with criteria per option", () => {
    const wire = toWireRequest(request, "jev-latest");
    expect(wire).toEqual({
      state: request.context,
      model: "jev-latest",
      questions: { q: { type: "choice", instructions: "Which?", criteria: { a: "A — first", b: "B — second" } } },
    });
  });
});

describe("normalizeAnswers", () => {
  it("reads choice, probabilities and confidence", () => {
    const [answer] = normalizeAnswers(request, { answers: { q: { type: "choice", choice: "b", probabilities: { a: 0.2, b: 0.8 }, confidence: 0.85 } } });
    expect(answer).toEqual({ id: "q", type: "choice", value: "b", optionProbabilities: { a: 0.2, b: 0.8 }, confidence: 0.85, needsReview: false });
  });

  it("falls back to the winner's probability when confidence is missing", () => {
    const [answer] = normalizeAnswers(request, { answers: { q: { choice: "a", probabilities: { a: 0.7, b: 0.3 } } } });
    expect(answer.confidence).toBe(0.7);
    expect(answer.needsReview).toBe(false);
  });

  it("flags a choice outside the option list instead of passing it through", () => {
    const [answer] = normalizeAnswers(request, { answers: { q: { choice: "c", probabilities: { a: 0.5, b: 0.5, c: 0.9 } } } });
    expect(answer.value).toBe("");
    expect(answer.needsReview).toBe(true);
    // unknown keys are dropped from the probabilities too
    expect(answer.optionProbabilities).toEqual({ a: 0.5, b: 0.5 });
  });

  it("flags a missing answer", () => {
    const [answer] = normalizeAnswers(request, { answers: {} });
    expect(answer.needsReview).toBe(true);
    expect(answer.confidence).toBe(0);
  });

  it("flags an answer that says it is not a choice, even when the value looks valid", () => {
    const [answer] = normalizeAnswers(request, { answers: { q: { type: "text", choice: "a", confidence: 0.9 } } });
    expect(answer.value).toBe("");
    expect(answer.needsReview).toBe(true);
  });

  it("accepts a null or differently-cased choice type", () => {
    expect(normalizeAnswers(request, { answers: { q: { type: null, choice: "a", confidence: 0.9 } } })[0].needsReview).toBe(false);
    expect(normalizeAnswers(request, { answers: { q: { type: "Choice", choice: "a", confidence: 0.9 } } })[0].needsReview).toBe(false);
  });

  it("keeps a valid pick with no confidence information, at zero confidence", () => {
    const [answer] = normalizeAnswers(request, { answers: { q: { choice: "a" } } });
    expect(answer).toEqual({ id: "q", type: "choice", value: "a", optionProbabilities: undefined, confidence: 0, needsReview: false });
  });

  it("never reads probabilities or answers off Object.prototype", () => {
    const req: JevRequest = { context: "x", questions: [{ type: "choice", id: "constructor", question: "?", options: ["constructor", "b"] }] };
    // no `constructor` answer key: must not pick up Object's constructor function
    expect(normalizeAnswers(req, { answers: {} })[0].needsReview).toBe(true);
    const [answer] = normalizeAnswers(req, { answers: { constructor: { choice: "constructor", probabilities: { b: 0.4 } } } });
    expect(answer.value).toBe("constructor");
    expect(answer.optionProbabilities).toEqual({ b: 0.4 });
    expect(answer.confidence).toBe(0);
  });
});
