import { expect, test } from "@playwright/test";
import { delayRoutingBy, openLab, trackPageErrors } from "./helpers";

const CONTEXT = "user: do I have anything on Thursday afternoon?";

test.describe("routing history recall", () => {
  test("restores mode, input, context and threshold by mouse and by keyboard", async ({ page }) => {
    const errors = trackPageErrors(page);
    const ui = await openLab(page);

    await ui.contextToggle.click();
    await ui.input.fill("Is it free?");
    await ui.context.fill(CONTEXT);
    await ui.slider.fill("0.5");
    await ui.run.click();
    const recall = ui.recallButton("Is it free?");
    await expect(recall).toBeVisible();

    await ui.input.fill("something else");
    await ui.context.fill("unrelated");
    await ui.slider.fill("0.9");
    await recall.focus();
    await page.keyboard.press("Enter");
    await expect(ui.input).toHaveValue("Is it free?");
    await expect(ui.context).toHaveValue(CONTEXT);
    await expect(ui.slider).toHaveValue("0.5");

    await ui.input.fill("x");
    await recall.click();
    await expect(ui.input).toHaveValue("Is it free?");
    // the button's click bubbles to the row: one handler, one recall, still one row
    await expect(page.locator("tbody tr")).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test("opens the context panel when the recalled entry had context", async ({ page }) => {
    const ui = await openLab(page);
    await ui.contextToggle.click();
    await ui.input.fill("Is it free?");
    await ui.context.fill(CONTEXT);
    await ui.run.click();
    await expect(ui.recallButton("Is it free?")).toBeVisible();
    await ui.contextToggle.click(); // collapse
    await expect(ui.context).toBeHidden();
    await ui.recallButton("Is it free?").click();
    await expect(ui.context).toBeVisible();
    await expect(ui.context).toHaveValue(CONTEXT);
  });
});

test.describe("persistence", () => {
  test("stores state after a run and removes it on Reset everything", async ({ page }) => {
    const ui = await openLab(page);
    await ui.run.click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    expect(await ui.storedState()).toContain('"history"');

    await ui.resetEverything.click();
    await expect(ui.historyEmpty).toBeVisible();
    await expect.poll(() => ui.storedState()).toBeNull();
  });

  test("threshold and history survive a reload", async ({ page }) => {
    const ui = await openLab(page);
    await ui.slider.fill("0.6");
    await ui.run.click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.reload();
    await ui.run.waitFor();
    await expect(ui.slider).toHaveValue("0.6");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });
});

test.describe("in-flight requests", () => {
  test("Clear keeps the decision of a run in progress but not its log line", async ({ page }) => {
    const ui = await openLab(page);
    await page.route("**/api/route", delayRoutingBy(1500));
    await ui.input.fill("What is 1234 * 56?");
    await ui.run.click();
    await expect(page.getByRole("button", { name: /Routing/ })).toBeVisible();
    await ui.clearHistory.click();
    await expect(ui.decisionPanel).toContainText("calculator", { timeout: 5_000 });
    await expect(ui.historyEmpty).toBeVisible();
    await expect(ui.errorBanner).toHaveCount(0);
    await expect(ui.run).toBeEnabled();
  });

  test("Reset everything aborts a run in progress without an error", async ({ page }) => {
    const ui = await openLab(page);
    await page.route("**/api/route", delayRoutingBy(1500));
    await ui.run.click();
    await expect(page.getByRole("button", { name: /Routing/ })).toBeVisible();
    await ui.resetEverything.click();
    await page.waitForTimeout(2500);
    await expect(ui.historyEmpty).toBeVisible();
    await expect(ui.noDecision).toBeVisible();
    await expect(ui.errorBanner).toHaveCount(0);
    await expect(ui.run).toBeEnabled();
    expect(await ui.storedState()).toBeNull();
  });
});

test.describe("option editor", () => {
  test("a duplicate of the required id can be fixed from either side", async ({ page }) => {
    const ui = await openLab(page);
    await ui.add.click();
    await page.getByLabel("Option 5 id").fill("no_tool_needed");
    await expect(page.getByLabel("Option 5 id")).toBeEnabled();
    await expect(page.getByLabel("Option 4 id")).toBeEnabled();
    await expect(ui.removeButtons).toHaveCount(5);
    await expect(ui.run).toBeDisabled();

    await ui.removeButtons.nth(3).click(); // remove the original; the survivor takes the lock
    await expect(page.getByLabel("Option 4 id")).toBeDisabled();
    await expect(ui.removeButtons).toHaveCount(3);
    await expect(ui.run).toBeEnabled();
  });

  test("stops at the API's option cap and can be reset", async ({ page }) => {
    const ui = await openLab(page);
    for (let i = 0; i < 40 && (await ui.add.isEnabled()); i++) await ui.add.click();
    await expect(ui.optionRows).toHaveCount(32);
    await expect(ui.add).toBeDisabled();
    await expect(ui.run).toBeEnabled();
    await ui.editorReset.click();
    await expect(ui.optionRows).toHaveCount(4);
  });
});

test.describe("routing decisions", () => {
  test("model router falls back to the safe default on a vague request", async ({ page }) => {
    const ui = await openLab(page);
    await page.getByRole("radio", { name: "Model Router" }).click();
    await ui.input.fill("hmm");
    await ui.run.click();
    await expect(ui.decisionPanel).toContainText("Fallback: safe default");
    await expect(ui.decisionPanel).toContainText("general_model");
    await expect(page.locator("tbody tr").first()).toContainText("safe default");
  });

  test("tool router asks for clarification instead of executing", async ({ page }) => {
    const ui = await openLab(page);
    await ui.input.fill("Handle it");
    await ui.run.click();
    await expect(ui.decisionPanel).toContainText("Fallback: ask the user");
    await expect(ui.decisionPanel).toContainText("would ask the user");
    await expect(page.locator("tbody tr").first()).toContainText("ask user");
  });
});

test.describe("layout and limits", () => {
  test("fields carry the API's length caps", async ({ page }) => {
    const ui = await openLab(page);
    await expect(ui.input).toHaveAttribute("maxlength", "20000");
    await ui.contextToggle.click();
    await expect(ui.context).toHaveAttribute("maxlength", "20000");
  });

  test("no horizontal overflow at 390px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await openLab(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
