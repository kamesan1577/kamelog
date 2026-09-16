import { expect, test } from "@playwright/test";

test("unknown URLs return the custom 404 with working recovery links", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const response = await page.goto("/missing-page-404-fixture");
  const homeLink = page.getByRole("link", { name: "ホームへ戻る" });
  const timelineLink = page.getByRole("link", { name: "タイムラインを見る" });
  const recoveryNav = page.getByRole("navigation", {
    name: "ほかのページへ移動",
  });

  expect(response?.status()).toBe(404);
  await expect(page).toHaveURL(/\/missing-page-404-fixture$/);
  await expect(
    page.getByRole("heading", { name: "ページが見つかりません" }),
  ).toBeVisible();
  await expect(recoveryNav).toBeVisible();
  await expect(homeLink).toHaveAttribute("href", "/");
  await expect(timelineLink).toHaveAttribute("href", "/timeline");
  await page.screenshot({
    path: testInfo.outputPath("landing-404-desktop.png"),
    fullPage: true,
  });

  await homeLink.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".landing-page")).toBeVisible();
});

test("missing post IDs share the 404 page and can reach the timeline", async ({
  page,
}) => {
  const response = await page.goto("/?post=missing-404-fixture");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "ページが見つかりません" }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await page.getByRole("link", { name: "タイムラインを見る" }).click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(
    page.getByRole("heading", { name: "タイムライン", exact: true }),
  ).toBeVisible();
});

test("mobile 404 stays within the viewport and browser back restores the URL", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto("/missing-mobile-404-fixture?source=share");
  const homeLink = page.getByRole("link", { name: "ホームへ戻る" });
  const timelineLink = page.getByRole("link", { name: "タイムラインを見る" });
  const originalUrl = /\/missing-mobile-404-fixture\?source=share$/;

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "ページが見つかりません" }),
  ).toBeVisible();
  await expect(homeLink).toBeVisible();
  await expect(timelineLink).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("landing-404-mobile.png"),
    fullPage: true,
  });

  await homeLink.click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(originalUrl);
  await expect(
    page.getByRole("heading", { name: "ページが見つかりません" }),
  ).toBeVisible();
});
