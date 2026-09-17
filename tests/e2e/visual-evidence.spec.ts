import { expect, test } from "@playwright/test";

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

const publicPages = [
  { name: "home", path: "/", marker: '[data-ds="landing-page"]' },
  {
    name: "timeline",
    path: "/timeline",
    marker: 'h1:has-text("タイムライン")',
  },
  { name: "projects", path: "/projects", marker: '[data-ds="projects-page"]' },
  {
    name: "federation",
    path: "/federation",
    marker: 'h1:has-text("ActivityPubに対応しています")',
  },
  {
    name: "not-found",
    path: "/missing-page-404-fixture",
    marker: 'h1:has-text("ページが見つかりません")',
  },
] as const;

for (const viewport of viewports) {
  for (const pageDefinition of publicPages) {
    test(
      "full-page visual evidence: " + pageDefinition.name + " " + viewport.name,
      async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        const response = await page.goto(pageDefinition.path);
        if (pageDefinition.name === "not-found")
          expect(response?.status()).toBe(404);
        else expect(response?.ok()).toBe(true);
        await expect(page.locator(pageDefinition.marker)).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(
            "visual-evidence-" +
              pageDefinition.name +
              "-" +
              viewport.name +
              ".png",
          ),
          fullPage: true,
        });
      },
    );
  }
}
