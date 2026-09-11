import { expect, test } from "@playwright/test";

test("War Room recomputes editable attack inputs, preserves exits and replays proof", async ({ page }) => {
  await page.goto("/demo/");
  await expect(page.getByRole("heading", { name: /Evidence, operating characteristics/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Market Truth War Room" })).toBeVisible();
  await page.screenshot({ path: "../../artifacts/ui-qa/proof-first-demo.png", fullPage: true });
  await expect(page.getByText("PARAMETERIZED ADVERSARIAL DEMO", { exact: false })).toBeVisible();

  const reset = page.getByRole("button", { name: /Reset incident/i });
  await reset.click();
  await expect(reset).toBeEnabled();
  await page.getByLabel("Evidence mode").selectOption("SYNTHETIC");
  await page.getByLabel("Order notional").fill("12000");
  await page.getByLabel("Attack (bps)").fill("600");

  const decision = page.locator(".decision-monolith");

  await page.getByRole("button", { name: /Normal market/i }).click();
  await expect(decision.getByText("ALLOW", { exact: true })).toBeVisible();
  await expect(page.getByText("12,000", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".incident-impact")).toHaveCount(0);

  await page.getByRole("button", { name: /Poison venue mark/i }).click();
  await expect(decision.getByText("BLOCK NEW RISK", { exact: true })).toBeVisible();
  await expect(page.locator(".war-provenance-strip").getByText("600 bps", { exact: true })).toBeVisible();
  await page.screenshot({ path: "../../artifacts/ui-qa/war-room-block.png", fullPage: true });
  await expect(decision.getByText("AVAILABLE", { exact: true })).toBeVisible();

  const impact = page.locator(".incident-impact");
  await expect(impact.getByText("INCIDENT IMPACT", { exact: true })).toBeVisible();
  await expect(impact.getByText("BLOCK NEW RISK", { exact: true }).first()).toBeVisible();
  await expect(impact.getByText("$12,000.00", { exact: true }).first()).toBeVisible();
  const restrictedPassport = await impact.getAttribute("data-passport-id");

  await page.getByRole("button", { name: /Prove exit stays open/i }).click();
  await expect(decision.getByText("ALLOW", { exact: true })).toBeVisible();
  await expect(impact.getByText("BLOCK NEW RISK", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: /Recover safely/i }).click();
  await expect(decision.getByText("ALLOW", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".timeline-track").getByText("RECOVERED", { exact: true })).toBeVisible();
  await expect(impact.getByText("BLOCK NEW RISK", { exact: true }).first()).toBeVisible();
  await expect(impact.getByText("ADDITIONAL EXPOSURE PREVENTED", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "../../artifacts/ui-qa/war-room-recovered-impact-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(impact.getByText("INCIDENT IMPACT", { exact: true })).toBeVisible();
  await expect(impact.getByText("BLOCK NEW RISK", { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: "../../artifacts/ui-qa/war-room-recovered-impact-mobile.png", fullPage: true });
  const viewportWidths = await page.locator("html").evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(viewportWidths.scroll).toBeLessThanOrEqual(viewportWidths.client);

  const replayRequest = page.waitForRequest((request) => request.url().endsWith("/v1/demo/war-room/replay"));
  await page.getByRole("button", { name: /Replay without safety gate/i }).click();
  expect((await replayRequest).postDataJSON()).toMatchObject({ passport_id: restrictedPassport });
  await expect(impact.getByText("COUNTERFACTUAL REPLAY VERIFIED", { exact: true })).toBeVisible();

  await reset.click();
  await expect(impact).toHaveCount(0);
});
