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

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  for (const [name, story] of [
    ["page-header", "patterns-pageheader--default"],
    ["post-card", "patterns-postcard--default"],
    ["project-list", "patterns-projectlist--default"],
    ["mobile-navigation", "patterns-mobilenavigation--three-equal-slots"],
  ] as const) {
    test(
      name + " representative state at " + viewport.name,
      async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/iframe.html?id=" + story + "&viewMode=story");
        await expect(page.locator("#storybook-root")).toHaveScreenshot(
          name + "-" + viewport.name + ".png",
        );
      },
    );
  }
}
