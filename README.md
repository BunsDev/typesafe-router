# Jev Tool & Model Router

A small TypeScript library plus a Next.js demo that uses [TypeSafe's Jev](https://typesafe.ai) as a **decision layer**: given a request and a fixed list of options, Jev says which option fits best and how confident it is. Your code then executes that choice.

```text
request + options ──▶ Jev (one "choice" question) ──▶ option id + confidence ──▶ YOUR executor
                        scores a closed set                 never free text        calls the model / runs the tool
```

## What Jev does and doesn't do

**Jev does not call tools and does not generate text.** It takes a piece of text plus typed questions and returns structured answers: for a `choice` question, one of the option keys you supplied, a probability for every key, and a confidence score. That is the entire contract.

This router leans on that deliberately:

- The only thing Jev is asked is one `choice` question whose options are exactly the `id`s in your `RouteOption[]`.
- The only thing the router hands back is one of those ids (or, for the tool router, an explicit "ask the user" action). It never surfaces free text from Jev as a route. An answer outside the list is rejected as an integrity failure and turned into a fallback.
- The library never executes anything. It does not know what `web_search` or `reasoning_model` mean at runtime. Wiring the returned id to a real API key, model call, or tool invocation is the integration point for whoever adopts it.

## Run the demo

```sh
npm install
cp .env.local.example .env.local   # optional: add TYPESAFE_API_KEY to route with real Jev
npm run dev
```

Open http://localhost:3000.

- **With a key** the header shows *Live · routing with Jev* and every decision is a real call to `POST https://api.typesafe.ai/v1/systemone`.
- **Without a key** the app runs in **demo mode**, clearly labeled *Demo mode — simulated routing, not real Jev calls*. A local keyword matcher (`lib/mockRouter.ts`) stands in for Jev so you can exercise the UI, the fallback logic, and the log without an account. It goes through the exact same engine, only the transport differs.

The key is read only on the server, inside `app/api/route/route.ts`. It is never sent to the browser.

### Bring your own key (safe to stream)

You don't need `.env.local` to route with real Jev. Click the status pill in the header (or **Add your key** in the demo banner) to open the key dialog and paste your own TypeSafe key:

- It is stored in that browser's `localStorage` only (`jev-router:api-key`). It never goes in the URL, in React state that renders, or in a log entry.
- The input is masked, the draft is wiped the moment you hit Save, and the saved key is never read back into the UI. The only thing rendered is a yes/no "a key is saved in this browser" status. No last-four, no reveal button. Screen-share or livestream the page without worrying.
- On each routing call the browser sends it as the `x-typesafe-api-key` header to this app's own `/api/route`, which forwards it to TypeSafe. The server never logs it, and every error message is passed through a redaction step so a key can't be echoed back.
- Precedence: browser key → `TYPESAFE_API_KEY` on the server → demo mode. **Remove key** clears it.

If you deploy this publicly, note that a browser key is sent to *your* server on every call. That is how the key stays out of the browser's network exposure to third parties, but it means users are trusting your deployment. Say so on the page if that matters for your audience.

### Limits on a public deployment

`/api/route` is unauthenticated, so it bounds what one request can make the server do (`lib/limits.ts`): the input and the context are capped at 20,000 characters each, an option list at 32 entries, and each option's id, label and description at 64, 120 and 1,000 characters. A body over 256 KB is refused with 413 before it is parsed. The lab applies the same caps as `maxLength` on its fields.

Calls that would spend the **server's** key are also rate limited per caller IP: `ROUTE_RATE_LIMIT_PER_MINUTE` (default 60, `0` disables) returns 429 with code `rate_limited` once exceeded. Calls that carry a browser-saved key are not counted; they spend that user's credits. The counter is per process, so on a serverless host it slows casual abuse rather than enforcing a global quota. Put a gateway limiter or an auth wall in front if the deployment is meant for strangers.

### What the lab remembers

Edited options, the threshold, and the routing history are saved in your browser (`localStorage`, key `jev-router:lab`) so a refresh doesn't lose them. **Reset everything** in the footer removes the stored copy; nothing is written back until you change something again. **Export JSON** in the history panel downloads the full log, one `RoutingLogEntry` per decision, for review or tuning. The API key is stored separately and is never part of this blob. Whatever is read back is validated field by field, and a malformed entry is dropped rather than rendered.

Selecting a request in the history table (click the row, or Tab to it and press Enter) loads its mode, input **and** conversation context back into the request panel, so re-running it reproduces the logged decision. Clearing the history or resetting the lab also discards any routing call still in flight, so a slow response can't reappear afterwards.

The **Conversation context** field under the input is the `context` half of `RouteRequest`: recent turns that should influence the pick. Try "Is it free?" on its own and then with a prior turn about Thursday afternoon.

Other scripts: `npm test` (vitest, 64 tests covering the engine, the wire format, the simulator, storage, the rate limiter, and the API route), `npm run typecheck` (runs `next typegen` first so a clean checkout has the generated `next-env.d.ts`, which is gitignored as Next.js recommends), `npm run lint`, `npm run build`.

## The two routers

Both are the same engine (`createRouter` in `lib/jevRouter.ts`) with different configs (`lib/routerConfigs.ts`).

| | Model router | Tool router |
| --- | --- | --- |
| Question | Which LLM / API key should handle this? | Which tool is relevant, if any? |
| Options | `fast_cheap_model`, `reasoning_model`, `code_model`, `general_model` | `web_search`, `calculator`, `calendar_lookup`, `no_tool_needed` |
| Required option | `general_model` (the safe default) | `no_tool_needed` (so Jev is never forced to pick a tool) |
| Below threshold | Route to `general_model` and log it | Return `needs_clarification`; nothing is executed |

## Using the library

```ts
import { createRouter, modelRouterConfig, modelRouterOptions } from "@/lib";

const modelRouter = createRouter(modelRouterConfig);

const { result, logEntry } = await modelRouter.route({
  userInput: "Fix this TypeScript bug: const x: number = 'a'",
  context: "…recent conversation, optional…",
  options: modelRouterOptions,
});

// result.decision        → { selectedOptionId, confidence, allOptionScores, fallbackUsed }
// result.action          → { kind: "none" } | { kind: "safe_default", optionId } | { kind: "needs_clarification", prompt }
// result.effectiveOptionId → the id your code should act on, or null when the action is needs_clarification

// ---- the boundary: everything below is YOUR code, not the library's ----
if (result.effectiveOptionId) {
  await callModel(result.effectiveOptionId, userInput);   // your executor
} else if (result.action.kind === "needs_clarification") {
  await reply(result.action.prompt);                       // ask, don't guess
}
```

The lower-level pieces are exported too:

- `routeWithJev(request, threshold?, transport?)` → a raw `RouteDecision` with Jev's pick and `fallbackUsed` set, no policy applied. Throws `RouteIntegrityError` if Jev's answer isn't in the option list, isn't a `choice` answer, or is missing. A valid pick that arrives without a confidence (and without probabilities) is kept at confidence 0, so it takes the ordinary low-confidence path rather than being reported as invalid.
- `resolveFallback(decision, options, policy, source)` → applies a `FallbackPolicy` to a decision. Pure, no I/O.
- `assertFallbackOption(options, policy)` → the runtime check described below.
- `buildRouterContext(request)` / `buildJevRequest(request)` → the exact text and question sent to Jev, so you can inspect or test it.
- `callJev(request, apiKey?)` → the low-level client. `mockCallJev` has the same signature for demo mode; tests inject their own.

## Core types

```ts
type RouteOption = { id: string; label: string; description: string; metadata?: Record<string, string | number> };
type RouteRequest = { userInput: string; context?: string; options: RouteOption[] };
type RouteDecision = { selectedOptionId: string; confidence: number; allOptionScores: Record<string, number>; fallbackUsed: boolean };
```

`description` is what Jev reads to score an option, so write it as "use this when…". `metadata` is never sent to Jev; it's for your executor (cost, latency, which API key, whatever you need). Full types are in `types/router.ts`.

## Adding options

Append to `modelRouterOptions` or `toolRouterOptions` in `lib/routerConfigs.ts`, or build your own list at call time; the option list is a plain array passed with every request. Two rules:

1. Every `id` must be unique. It is the only value Jev can return, so make it stable. Ids are used as object keys in the wire format and the score maps, and the library builds and reads those maps so that awkward ids such as `constructor` or `__proto__` behave like any other.
2. The list must still contain the option the fallback policy requires (`general_model` for the model router, `no_tool_needed` for the tool router). Otherwise `createRouter(...).route()` throws a `RouterConfigError` **before** calling Jev:

   ```text
   Option list is missing the required no-tool escape hatch option "no_tool_needed".
   Every option list passed to the router must include it so a low-confidence
   decision can never be silently misrouted. Options present: [web_search, calculator, calendar_lookup].
   ```

To make a third router, call `createRouter` with your own `RouterConfig`: a `mode`, a `confidenceThreshold`, and a `fallback` policy that is either `{ kind: "safe_default", optionId }` or `{ kind: "needs_clarification", requiredOptionId, clarificationPrompt? }`.

In the demo UI you can add, edit, and remove options live. The required option's row is locked against deletion and the Run button explains why if the list is invalid.

## Confidence threshold and fallback: why they exist

A classifier that always returns *something* will happily return its least-bad guess at 0.31 confidence. Acting on that means calling the wrong tool or paying for the wrong model, silently. The threshold (default `0.75`, adjustable per router, per call, and with the slider in the demo) is the line below which the router refuses to trust the top pick.

What happens below the line depends on what's safe for that router:

- **Model router → safe default.** Sending a request to a balanced general model is never harmful, only possibly suboptimal, so a low-confidence pick is replaced with `general_model`. The original pick and its scores are still in the decision and the log for tuning.
- **Tool router → ask the user.** Calling the wrong tool can have side effects (a search that leaks a query, a calendar write, a wasted API call). There is no safe tool to default to, so the router returns `needs_clarification` with a prompt and **no option to execute**. `effectiveOptionId` is `null` on purpose.
- **Invalid answer → same fallback, different reason.** If Jev returns an id that isn't in the list, or no usable answer, the router does not guess. It applies the same policy with `reason: "invalid_option"`.

`no_tool_needed` is required in the tool router's list for a related reason: without it, Jev is forced to pick a tool even when none applies, and a confident-looking "web_search" for "write me a poem" is exactly the kind of misroute this exists to prevent.

Every call produces one `RoutingLogEntry` with the input, the options considered, Jev's pick, the effective option, confidence, threshold, all scores, whether fallback was used and which action ran, the source (`jev` or `mock`), and timing. The default logger prints to the console; pass your own `logger` in the config to ship them wherever you review routing quality. The demo shows the same entries in its history table.

## Project layout

```text
lib/
  apiKeyStorage.ts      browser-only key storage; the only reader hands the key straight to fetch
  labStorage.ts         browser-only persistence of options, threshold and history, validated on load; JSON export
  limits.ts             size caps shared by the API route (enforced) and the UI (maxLength)
  rateLimit.ts          in-memory sliding-window limiter for calls that spend the server key
  jevClient.ts          low-level Jev API wrapper (wire format, errors, normalisation)
  jevRouter.ts          engine: validation, routeWithJev, resolveFallback, createRouter, logging
  routerConfigs.ts      modelRouterOptions, toolRouterOptions, fallback policies
  mockRouter.ts         demo-mode keyword simulator, same JevTransport signature as callJev
  index.ts              public re-exports
  *.test.ts             vitest suites
types/
  router.ts             RouteOption, RouteRequest, RouteDecision, FallbackPolicy, RoutingLogEntry, …
app/
  page.tsx              renders the lab client-only (LabLoader) so restored state needs no hydration dance
  api/route/route.ts    server-side routing endpoint; the only place the API key is read
components/
  LabLoader.tsx         client-only dynamic import of RouterLab with a skeleton
  RouterLab.tsx         state: mode, input, context, options per mode, threshold, result, history
  ApiKeyPanel.tsx       bring-your-own-key dialog: masked input, never displayed, stored in this browser
  ThemeToggle.tsx       light/dark switch with transitions suppressed for the flip
  ModeToggle.tsx        Model Router / Tool Router
  OptionEditor.tsx      live-editable option list with the required option locked
  ThresholdSlider.tsx   confidence threshold
  RoutingResult.tsx     pick, colour-coded confidence, fallback status, mocked execution line
  ScoreBreakdown.tsx    per-option probability bars with the threshold marker
  RoutingHistoryTable.tsx
.env.local.example
```

## Jev wire format, for reference

`lib/jevClient.ts` converts the router's request into TypeSafe's format:

The request line is JSON-encoded, so quotes and newlines inside the user's text are escaped and cannot pose as the `Options:` or `Conversation context:` sections that follow.

```jsonc
// POST https://api.typesafe.ai/v1/systemone   Authorization: Bearer <key>
{
  "state": "Request: \"…\"\n\nOptions:\n- web_search: Web search — …",
  "model": "jev-latest",
  "questions": {
    "router.select_option": {
      "type": "choice",
      "instructions": "Given the request, which option is the best fit?",
      "criteria": { "web_search": "Web search — …", "calculator": "…", "…": "…" }
    }
  }
}
// → { "answers": { "router.select_option": { "type": "choice", "choice": "web_search", "probabilities": {…}, "confidence": 0.91 } } }
```

This is an independent community project, not an official TypeSafe product.
