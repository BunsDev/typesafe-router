# Agent guide — Jev Tool & Model Router

These instructions apply to this repository and its descendants unless a more specific AGENTS.md applies. Read README.md, package.json, the relevant tests, and the actual implementation before changing behavior.

## Purpose

This independent community project separates Jev's closed-set selection from application-owned execution. Preserve that boundary: the routing library may call the Jev classifier, but it does not call the selected downstream model, execute tools, grant permissions, or prove a request safe.

## Package manager and layout

Use npm with `package-lock.json`: `npm ci`, `npm test`, and `npm run <script>`. Do not introduce another lockfile or silently migrate the package manager. The root manifest currently does not pin Node or a package-manager version; do not invent an existing pin in documentation.

- `lib/jevRouter.ts`: validation, closed-set selection, fallback resolution, and logs.
- `lib/jevClient.ts`: provider request/response adapter and error handling.
- `lib/routerConfigs.ts`: model/tool examples and required fallback options.
- `lib/mockRouter.ts`: deterministic demo transport, not live Jev.
- `types/router.ts` and `lib/index.ts`: public contracts and exports.
- `app/api/route/route.ts`: server endpoint and key precedence.
- `components/RouterLab.tsx`: lab state and interface.
- `lib/apiKeyStorage.ts` and `lib/labStorage.ts`: separate browser storage.

## Invariants

Validate nonempty input, unique option ids, at least two options, and the policy's required option before calling Jev. Reject invalid thresholds. Keep the `router.select_option` choice restricted to the supplied ids; never execute free-form model text or dynamically dispatch an untrusted id.

Keep model `safe_default` and tool `needs_clarification` semantics distinct. Low-confidence clarification must keep `effectiveOptionId` null. Preserve `no_tool_needed` as an explicit no-action outcome. Preserve Jev's original pick, effective pick, scores, source, and fallback reason for inspection. Do not describe `safe_default` as universally harmless.

An invalid/unusable answer goes through the configured fallback with `invalid_option`. A transport/provider error remains an error, not a synthetic success. Do not silently widen candidate sets, lower thresholds, remove required options, or replace errors with mock results to make tests pass.

Keep public types and exports aligned with the UI and tests. Request `metadata` is local integration data; do not start forwarding it to the provider incidentally. Any real executor needs a separately reviewed authorization boundary, trusted option registry, privacy controls, and spending/approval policy.

## Credentials, privacy, and truthfulness

Keep environment credentials server-side. Browser-supplied keys travel in the same-origin request header and remain separate from exported lab state. Preserve redaction and key-removal behavior; never put a key in model state, a URL, a response, a log entry, or a NEXT_PUBLIC_ variable.

Browser localStorage is not a secret vault. Routing inputs, context, logs, and exports may contain private data; the default logger prints an input excerpt. Use synthetic fixtures, never real credentials or private transcripts. Keep mock, live, fallback, and failed outcomes visibly distinct. Confidence is a decision signal, not proof of correctness or authorization.

## Verification and handoff

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Use injected/mock transports in tests; do not consume shared API credits. Relevant regression cases include invalid ids, missing fallback options, duplicate ids, threshold boundaries, null clarification routes, provider failures, wire-format normalization, and storage/export separation. For UI changes, check both modes, option editing, key lifecycle, history, themes, keyboard use, and narrow layouts.

Report the files changed, commands actually run, outcomes, and anything not verified. Do not claim unit tests prove live provider behavior or production security. Keep README.md and CONTRIBUTING.md synchronized. Keep CLAUDE.md as `@AGENTS.md` and preserve the generated Next.js block below.

`repository-metadata.json` records intended GitHub About text/topics, not an automatic settings integration. Do not publish a package, create release tags, change licensing/visibility, or add real execution as part of documentation cleanup.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
