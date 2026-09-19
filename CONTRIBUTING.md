# Contributing to Jev Tool & Model Router

Read [README.md](README.md) and [AGENTS.md](AGENTS.md) before changing the routing contract. Use npm and the committed `package-lock.json`; install with `npm ci`.

Keep changes focused. A routing improvement should include a synthetic example, an expected policy outcome, and tests using an injected transport. Do not combine documentation fixes with dependency upgrades or real tool/model execution.

## Preserve the boundary

Jev selects from supplied option ids; the application separately authorizes and executes. Preserve required fallback options, null clarification routes, explicit no-tool outcomes, invalid-answer handling, and provider-error propagation. Retain original and effective selections in logs. Never make a failed live call look like a successful mock run.

Keep credentials out of fixtures, screenshots, logs, and exports. Browser storage and routing history can contain sensitive information even when key fields are masked.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run e2e   # Playwright, builds and serves the app in demo mode
```

GitHub Actions runs all of these on every pull request and on `main` (`.github/workflows/ci.yml`): one job for the unit tests, types, lint and build, and one for the end-to-end suite. The end-to-end job needs no credentials, since the suite serves the app with the key unset and routes through the simulator. A failing run uploads its Playwright report as an artifact.

Automated tests should not need a real API key. For UI changes, exercise model/tool modes, option validation, threshold changes, fallback visibility, key removal, storage/export behavior, keyboard controls, themes, and narrow screens.

Open a pull request explaining the intended behavior, why it preserves the execution boundary, which tests ran, and any unverified behavior. Include a before/after example or screenshot when useful. A proposed GitHub topic change in `repository-metadata.json` still needs a separate authorized repository-settings update.
