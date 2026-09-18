# Jev Tool & Model Router

A TypeScript routing library and interactive Next.js demo that use **TypeSafe AI's Jev** to select from a fixed set of tools or models, then apply explicit confidence and fallback policies.

**Jev selects. Your application authorizes and executes.** This is an independent community project under `BunsDev`, not an official TypeSafe SDK or a production authorization system. The root package is private; the library is source in this repository, not a published npm install.

[Contributing](CONTRIBUTING.md) · [Agent guide](AGENTS.md) · [TypeSafe API reference](https://docs.typesafe.ai/api)

```text
request + allowed options -> Jev choice -> validation + fallback -> effective option
                                                                     |
                                               your authorization and executor
```

## What it does

The model and tool routers share one engine, `createRouter` in `lib/jevRouter.ts`. Each call asks one `choice` question using the supplied option ids as the closed set. The result retains Jev's original pick, its scores, the effective option after policy, and the fallback reason.

The library **does not execute tools or invoke the selected downstream model**. It does make a Jev API call when using the live transport. The UI's execution display is illustrative, not evidence that an external action ran. A structurally valid choice can still be the wrong decision.

## Run locally

Use npm and the committed `package-lock.json`; do not generate a competing pnpm, Yarn, or Bun lockfile. Use a Node.js version supported by the installed Next.js dependency; Node.js 22+ is a practical development baseline. This repository currently has no root `engines` or `packageManager` pin.

```sh
git clone https://github.com/BunsDev/typesafe-router.git
cd typesafe-router
npm ci
npm run dev
```

Open the address printed by Next.js, normally `http://localhost:3000`. With no configured key, the demo uses the local keyword-based `mockCallJev` transport. Mock and live results are labeled separately.

For live routing, get a key from the [TypeSafe console](https://console.typesafe.ai), then optionally configure the server:

```sh
cp .env.local.example .env.local
# Edit .env.local and set TYPESAFE_API_KEY, then restart the dev server.
```

The browser calls this app's `/api/route` endpoint. The server forwards live evaluations to `POST https://api.typesafe.ai/v1/systemone` using `jev-latest`. Jev answers typed questions; it does not generate the code that executes a route.

### Bring your own key and privacy

The key dialog also accepts a personal key. Precedence is **browser key → server environment key → demo mode**.

A browser key persists, unencrypted by the app, in `localStorage` under `jev-router:api-key`. It is sent in the `x-typesafe-api-key` header to this application's server, which forwards it to TypeSafe. Masking the field reduces accidental screen exposure; it does not protect against scripts running on the origin, access to the browser profile, developer tools, or an untrusted deployment. Use a deployment you trust and remove the key on shared machines.

### Limits on a public deployment

`/api/route` is unauthenticated, so it bounds what one request can make the server do (`lib/limits.ts`): the input and the context are capped at 20,000 characters each, an option list at 32 entries, and each option's id, label and description at 64, 120 and 1,000 characters. A body over 256 KB is refused with 413 before it is parsed. The lab applies the same caps as `maxLength` on its fields and stops the editor at 32 options. Option ids, labels and descriptions are collapsed onto one line in the text sent to Jev, so a line break inside one cannot open a fake section.

Calls that would spend the **server's** key are also rate limited: `ROUTE_RATE_LIMIT_PER_MINUTE` (default 60, `0` disables) returns 429 with code `rate_limited` once exceeded. Calls that carry a browser-saved key are not counted; they spend that user's credits. By default every caller shares one bucket, because `x-forwarded-for` and `x-real-ip` are whatever the client sent when the app is reached directly. Set `ROUTE_TRUST_PROXY=1` when a proxy you control (Vercel, nginx, a load balancer) overwrites those headers, and the limit becomes per client IP, read from the last forwarded hop. The counter is per process and tracks at most 10,000 callers (idle ones are dropped first, then the least recently seen), so on a serverless host it slows casual abuse rather than enforcing a global quota. Put a gateway limiter or an auth wall in front if the deployment is meant for strangers.

### What the lab remembers

Edited options, the threshold, and the routing history are saved in your browser (`localStorage`, key `jev-router:lab`) so a refresh doesn't lose them. **Reset everything** in the footer removes the stored copy; nothing is written back until you change something again. **Export JSON** in the history panel downloads the full log, one `RoutingLogEntry` per decision, for review or tuning. The API key is stored separately and is never part of this blob. Whatever is read back is validated field by field, and a malformed entry is dropped rather than rendered.

Selecting a request in the history table (click the row, or Tab to it and press Enter) loads its mode, input, conversation context and threshold back into the request panel. The options are whatever the editor holds at that moment (only their ids are logged), so a re-run is a fresh decision, not a replay. Resetting the lab discards any routing call still in flight; clearing the history while a call is running keeps that decision on screen but doesn't re-add it to the log.
The server environment key is not sent to the browser. Do not commit `.env.local`, embed a key in a component or URL, or use a `NEXT_PUBLIC_` credential. A public server key can spend the owner's credits on visitors' requests; add appropriate access controls, request limits, and provider-side spending limits before offering one publicly. These deployment controls are not provided by the routing decision itself.

## Routing policies

| Case | Model router | Tool router |
| --- | --- | --- |
| Example options | `fast_cheap_model`, `reasoning_model`, `code_model`, `general_model` | `web_search`, `calculator`, `calendar_lookup`, `no_tool_needed` |
| Required option | `general_model` | `no_tool_needed` |
| Below confidence threshold | Use configured `safe_default` | Return `needs_clarification`; `effectiveOptionId` is `null` |
| Unusable or out-of-list answer | Same configured fallback, reason `invalid_option` | Same configured fallback, reason `invalid_option` |
| Invalid configuration | Throw `RouterConfigError` before calling Jev | Throw `RouterConfigError` before calling Jev |
| Transport/provider error | Reject the call; do not turn failure into a successful route | Reject the call; do not turn failure into a successful route |

Other scripts: `npm test` (vitest: the engine, the wire format, the simulator, storage, the rate limiter, and the API route), `npm run e2e` (Playwright: builds and serves the app in demo mode, then drives the lab and the API through a real browser: recall, persistence, Clear and Reset during a run, the option editor, fallbacks, limits; `--ui` opens Playwright's inspector), `npm run typecheck` (runs `next typegen` first so a clean checkout has the generated `next-env.d.ts`, which is gitignored as Next.js recommends), `npm run lint`, `npm run build`.
The default threshold is `0.75`, with per-router and per-call overrides. `safe_default` is the policy name, **not a guarantee of harmless execution**. A downstream model call may expose data, cost money, or violate an application's policy. The integrating application must validate the selected id against a trusted registry and independently enforce permissions, privacy, budgets, and approval requirements.

`no_tool_needed` is an explicit no-action option, not a tool to invoke. Preserve it when editing the tool list. For clarification, ask the user rather than executing Jev's original low-confidence selection.

## Use the library

This example runs inside this repository and uses the mock transport, so it does not consume API credits:

```ts
import { createRouter } from "@/lib/jevRouter";
import { modelRouterConfig, modelRouterOptions } from "@/lib/routerConfigs";
import { mockCallJev } from "@/lib/mockRouter";

const router = createRouter(modelRouterConfig, mockCallJev, "mock");
const userInput = "Help me debug a TypeScript type error.";
const { result, logEntry } = await router.route({
  userInput,
  context: "The request concerns a local development project.",
  options: modelRouterOptions,
});

console.log(result.effectiveOptionId, result.action, logEntry.source);
// This example deliberately does not execute the returned option.
```

For live server-side use, supply the real transport instead of the mock and configure credentials securely. Do not move a provider credential into client-side imports merely to reuse this example.

### Core API

- `routeWithJev(request, threshold?, transport?)` → a raw `RouteDecision` with Jev's pick and `fallbackUsed` set, no policy applied. Throws `RouteIntegrityError` if Jev's answer isn't in the option list, isn't a `choice` answer, or is missing. A valid pick that arrives without a confidence (and without probabilities) is kept at confidence 0, so it takes the ordinary low-confidence path rather than being reported as invalid.
- `resolveFallback(decision, options, policy, source)` → applies a `FallbackPolicy` to a decision. Pure, no I/O.
- `assertFallbackOption(options, policy)` → the runtime check described below.
- `buildRouterContext(request)` / `buildJevRequest(request)` → the exact text and question sent to Jev, so you can inspect or test it.
- `callJev(request, apiKey?)` → the low-level client. `mockCallJev` has the same signature for demo mode; tests inject their own.
- `createRouter(config, transport?, source?)` validates requests, calls the transport, applies policy, and logs the result.
- `routeWithJev(request, threshold?, transport?)` returns the raw decision and throws `RouteIntegrityError` for an unusable or out-of-set answer. It does not apply the full router fallback policy.
- `resolveFallback(decision, options, policy, source)` applies the deterministic policy without network I/O.
- `assertFallbackOption(options, policy)` checks the required fallback/no-tool option.
- `buildRouterContext(request)` and `buildJevRequest(request)` expose what will be submitted.

Public re-exports live in `lib/index.ts`; full types live in `types/router.ts`.

```ts
type RouteOption = {
  id: string;
  label: string;
  description: string;
  metadata?: Record<string, string | number>;
};
type RouteRequest = { userInput: string; context?: string; options: RouteOption[] };
```

Use stable, unique ids and at least two options. Write descriptions as “use this when…” guidance. The option `metadata` is for the integrating application and is not sent to Jev. Keep the policy's required option in every request. Add a new router with an explicit `mode`, threshold, and `safe_default` or `needs_clarification` policy.

## Saved state, logs, and tuning

The lab stores edited options, thresholds, and history in `localStorage` under `jev-router:lab`. Reset clears the lab state; remove the API key separately. Exported JSON contains routing history, not the separately stored key. Inputs and conversation context can nevertheless contain private information: inspect exports before sharing.

1. Every `id` must be unique. It is the only value Jev can return, so make it stable. Ids are used as object keys in the wire format and the score maps, and the library builds and reads those maps so that awkward ids such as `constructor` or `__proto__` behave like any other.
2. The list must still contain the option the fallback policy requires (`general_model` for the model router, `no_tool_needed` for the tool router). Otherwise `createRouter(...).route()` throws a `RouterConfigError` **before** calling Jev:
Logs record the input/context, considered options, original and effective selections, confidence, threshold, scores, fallback action, source (`jev` or `mock`), and duration. The default console logger prints a shortened input excerpt. For sensitive integrations, supply an appropriate logger and retention policy; do not assume prompts are automatically redacted. Mock confidence and routing outcomes are demonstrations, not model-quality measurements.

## Project map

| Path | Responsibility |
| --- | --- |
| `lib/jevRouter.ts` | Validation, request construction, policy, and logging. |
| `lib/jevClient.ts` | TypeSafe wire format, response normalization, and provider errors. |
| `lib/routerConfigs.ts` | Example model/tool options and fallback policies. |
| `lib/mockRouter.ts` | Local simulated transport. |
| `lib/apiKeyStorage.ts`, `lib/labStorage.ts` | Separate browser key and lab-state storage. |
| `types/router.ts` | Public routing contracts. |
| `app/api/route/route.ts` | Same-origin server endpoint and credential handling. |
| `components/RouterLab.tsx` | Interactive lab, options, threshold, and history. |

## Development checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Use mock/injected transports for automated checks. For UI changes, also exercise both router modes, required-option deletion protection, invalid options, low-confidence clarification, key removal, persistence, exports, themes, and narrow screens. Report actual test results rather than keeping a hardcoded test count in this README.

```text
e2e/
  lab.spec.ts           browser flows against the production build (Playwright)
  api.spec.ts           /api/route contract in demo mode
  helpers.ts            locators and a request-delaying route
playwright.config.ts    builds and serves on :3111 with the key unset
lib/
  apiKeyStorage.ts      browser-only key storage; the only reader hands the key straight to fetch
  labStorage.ts         browser-only persistence of options, threshold and history, validated on load; JSON export
  guards.ts             isFiniteNumber and readOwn (prototype-safe reads of maps keyed by option id)
  limits.ts             size caps shared by the API route (enforced) and the UI (maxLength)
  rateLimit.ts          in-memory sliding-window limiter for calls that spend the server key
  jevClient.ts          low-level Jev API wrapper (wire format, errors, normalisation)
  jevRouter.ts          engine: validation, routeWithJev, resolveFallback, createRouter, logging
  routerConfigs.ts      modelRouterOptions, toolRouterOptions, fallback policies
  mockRouter.ts         demo-mode keyword simulator, same JevTransport signature as callJev
  index.ts              public re-exports
  testing/fakeStorage.ts  localStorage stand-in for the storage tests
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
## Related community projects

[TypeSafe AI Playground](https://github.com/BunsDev/typesafe-ai-playground) explores Jev use cases; [Clarity Judge](https://github.com/BunsDev/clarity-judge) applies named writing checks; [TypeSafe UI](https://github.com/BunsDev/typesafe-ui) provides interface components. They are separate projects, not automatically integrated dependencies.

The proposed GitHub About description and topics are recorded in [repository-metadata.json](repository-metadata.json). Editing that file does not apply GitHub settings automatically.
