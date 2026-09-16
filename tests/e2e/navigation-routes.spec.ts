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
