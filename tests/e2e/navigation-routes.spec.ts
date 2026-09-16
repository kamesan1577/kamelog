import { expect, test } from "@playwright/test";

test("public main views keep their URL across navigation and reload", async ({
  page,
}) => {
  await page.goto("/timeline");
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(
    page.getByRole("heading", { name: "タイムライン", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "プロジェクト", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator(".projects-page")).toBeVisible();
  await expect(page.locator(".project-article")).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator(".projects-page")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(
    page.getByRole("heading", { name: "タイムライン", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "ホーム", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /かめさん.*Backend Engineer/ }),
  ).toBeVisible();
});

test("federation guide keeps URL and history", async ({ page }) => {
  await page.goto("/timeline");
  const heading = page.locator(".page-heading");
  const notice = heading.getByText("ActivityPubに対応しています。");
  await expect(notice).toBeVisible();
  const guideLink = heading.getByRole("link", { name: "対応範囲を見る" });
  await expect(guideLink).toHaveAttribute("href", "/federation");
  await expect(guideLink).toHaveCount(1);

  await guideLink.click();
  await expect(page).toHaveURL(/\/federation$/);
  await expect(
    page.getByRole("heading", { name: "ActivityPubに対応しています" }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/federation$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(guideLink).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/federation$/);

  await page.getByRole("link", { name: "kamelogへ戻る" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: /かめさん.*Backend Engineer/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/federation$/);
});

test("direct federation visit preserves query and history", async ({ page }) => {
  await page.goto("/");
  await page.goto("/federation?source=timeline");
  await expect(page).toHaveURL(/\/federation\?source=timeline$/);
  await expect(
    page.getByRole("heading", { name: "ActivityPubに対応しています" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/federation\?source=timeline$/);
});

test("mobile timeline shows a single federation link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/timeline");
  const guideLink = page
    .locator(".page-heading")
    .getByRole("link", { name: "対応範囲を見る" });
  await expect(guideLink).toBeVisible();
  await expect(guideLink).toHaveCount(1);
  await guideLink.click();
  await expect(page).toHaveURL(/\/federation$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(guideLink).toHaveCount(1);
});
