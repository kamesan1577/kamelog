import { expect, test } from "@playwright/test";

test("landing polish keeps desktop and mobile controls readable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const primary = page.getByRole("button", {
    name: /タイムラインを見る/,
  });
  await expect(primary).toHaveCSS("background-color", "rgb(55, 53, 47)");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(246, 245, 244)",
  );
  await expect(page.locator(".landing-profile")).toHaveCSS(
    "background-color",
    "rgb(243, 242, 239)",
  );
  await page.screenshot({
    path: testInfo.outputPath("landing-desktop.png"),
    fullPage: true,
  });

  const contentRow = page
    .locator(".content-cards")
    .getByRole("button", { name: /ブログ/ });
  await contentRow.hover();
  await expect(contentRow).toHaveCSS("background-color", "rgb(247, 247, 245)");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(primary).toBeVisible();
  await expect(primary).toHaveCSS("min-height", "44px");
  await expect(page.locator(".landing-page")).toHaveCSS(
    "overflow-x",
    "visible",
  );
  await page.screenshot({
    path: testInfo.outputPath("landing-mobile.png"),
    fullPage: false,
  });
});
