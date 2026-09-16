import { test, expect } from "@playwright/test";

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`Button primary at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(
      "/iframe.html?id=primitives-button--primary&viewMode=story",
    );
    await expect(page.locator("[data-ds=button]")).toHaveScreenshot(
      `button-primary-${viewport.name}.png`,
    );
  });
}
