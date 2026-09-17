import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks against the production build, in demo mode (no TypeSafe
 * key), so they run anywhere without credentials or network access.
 *
 *   npm run e2e            build, serve on :3111, run every spec
 *   npm run e2e -- --ui    same, in Playwright's UI
 */
const PORT = 3111;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/route`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Force demo mode even if the developer has a key in .env.local: a set (empty) variable wins over the file.
    env: { TYPESAFE_API_KEY: "", ROUTE_TRUST_PROXY: "" },
  },
});
