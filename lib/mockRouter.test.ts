import { describe, expect, it } from "vitest";
import { buildJevRequest } from "@/lib/jevRouter";
import { mockCallJev } from "@/lib/mockRouter";
import { modelRouterOptions, toolRouterOptions } from "@/lib/routerConfigs";

async function pick(userInput: string, options = toolRouterOptions) {
  const [answer] = await mockCallJev(buildJevRequest({ userInput, options }));
  return answer;
}

describe("mockCallJev (demo mode)", () => {
  it("only ever returns an id from the option list, with probabilities summing to ~1", async () => {
    const answer = await pick("Am I free on Thursday afternoon?");
    expect(toolRouterOptions.map((o) => o.id)).toContain(answer.value);
    const total = Object.values(answer.optionProbabilities ?? {}).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
    expect(answer.confidence).toBe(answer.optionProbabilities?.[answer.value]);
  });

  it("is deterministic", async () => {
    const a = await pick("What's the latest news on the election?");
    const b = await pick("What's the latest news on the election?");
    expect(a).toEqual(b);
  });

  it("routes obvious tool requests sensibly", async () => {
    expect((await pick("What's the latest news on the election today?")).value).toBe("web_search");
    expect((await pick("What is 1234 * 56?")).value).toBe("calculator");
    expect((await pick("Do I have any meetings tomorrow morning?")).value).toBe("calendar_lookup");
    expect((await pick("Write me a short poem about autumn")).value).toBe("no_tool_needed");
  });

  it("routes obvious model requests sensibly", async () => {
    expect((await pick("Fix this TypeScript bug: const x: number = 'a'", modelRouterOptions)).value).toBe("code_model");
    expect((await pick("What is the capital of Peru?", modelRouterOptions)).value).toBe("fast_cheap_model");
    expect((await pick("Explain step by step why this plan is optimal and analyze the trade-offs", modelRouterOptions)).value).toBe("reasoning_model");
  });

  it("scores user-added options from their description words", async () => {
    const options = [...toolRouterOptions, { id: "send_email", label: "Send email", description: "Compose and send an email message to a recipient." }];
    const answer = await pick("Send an email to Sam about the invoice", options);
    expect(answer.value).toBe("send_email");
  });
});
