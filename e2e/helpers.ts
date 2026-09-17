import type { Page, Route } from "@playwright/test";

export const LAB_STORAGE_KEY = "jev-router:lab";

/** Collect uncaught page errors so a test can assert there were none. */
export function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

/** Hold every routing POST for `ms` so a test can act while a request is in flight. */
export function delayRoutingBy(ms: number) {
  return async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, ms));
    return route.continue();
  };
}

export function lab(page: Page) {
  return {
    run: page.getByRole("button", { name: "Run routing decision" }),
    input: page.getByLabel("User input"),
    context: page.getByLabel("Conversation context"),
    contextToggle: page.getByRole("button", { name: /Conversation context/ }),
    slider: page.getByRole("slider"),
    add: page.getByRole("button", { name: "Add option" }),
    editorReset: page.getByRole("button", { name: "Reset", exact: true }),
    resetEverything: page.getByRole("button", { name: "Reset everything" }),
    clearHistory: page.getByRole("button", { name: "Clear" }),
    historyEmpty: page.getByText("Nothing routed yet"),
    noDecision: page.getByText("No decision yet."),
    decisionPanel: page.locator("section.panel", { has: page.locator(".panel-title", { hasText: "Decision" }) }),
    errorBanner: page.locator('p[role="alert"]'),
    optionRows: page.locator("ul > li"),
    removeButtons: page.getByRole("button", { name: /^Remove / }),
    recallButton: (input: string) => page.getByRole("button", { name: `Load this request: ${input}` }),
    storedState: () => page.evaluate((key) => localStorage.getItem(key), LAB_STORAGE_KEY),
  };
}

export async function openLab(page: Page) {
  await page.goto("/");
  const ui = lab(page);
  await ui.run.waitFor();
  return ui;
}
