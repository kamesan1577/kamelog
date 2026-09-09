import { test, expect } from "@playwright/test";

const bannerFixture = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><rect width="200" height="40" fill="white"/></svg>`;

async function mockShiryuBanner(page: import("@playwright/test").Page) {
  await page.route("**/api/shiryu-banner", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: bannerFixture,
    });
  });
}

test("public site exposes source code, issue-report, and mutual links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockShiryuBanner(page);
  await page.goto("/");

  const footer = page.getByRole("contentinfo", {
    name: "kamelogの開発情報",
  });
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toBeVisible();
  await expect(
    footer.getByRole("link", { name: "ソースコード" }),
  ).toHaveAttribute("href", "https://github.com/kamesan1577/kamelog");
  await expect(
    footer.getByRole("link", { name: "不具合・要望をIssueで報告" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/kamesan1577/kamelog/issues/new",
  );

  await expect(footer.getByText("相互リンク", { exact: true })).toBeVisible();
  const mutualLink = footer.getByRole("link", {
    name: "Shiryu のホームページ",
  });
  await expect(mutualLink).toHaveAttribute("href", "https://shiryu.win/");
  await expect(
    mutualLink.getByRole("img", { name: "Shiryu のホームページ" }),
  ).toBeVisible();
});

test("Shiryu mutual-link banner keeps its 200x40 size on desktop", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockShiryuBanner(page);
  await page.goto("/");

  const footer = page.getByRole("contentinfo", {
    name: "kamelogの開発情報",
  });
  await footer.scrollIntoViewIfNeeded();

  const banner = footer.getByRole("img", { name: "Shiryu のホームページ" });
  await expect(banner).toBeVisible();
  const box = await banner.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(200);
  expect(Math.round(box?.height ?? 0)).toBe(40);
});
