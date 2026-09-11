import { test, expect } from "@playwright/test";

test("automatic tag labels", async ({ page }) => {
  const taggedPost = {
    revision: 1,
    id: "fictional-auto-tag-post",
    kind: "tweet",
    title: "",
    body: "自動タグ表示を確認する架空の投稿",
    date: "2026-09-11T00:00:00.000Z",
    tags: ["手動タグ", "自動タグ候補"],
    autoTags: [
      {
        tag: "自動タグ候補",
        confidence: 0.91,
        modelVersion: "e2e-fixture",
        contentHash: "fictional-content-hash",
      },
    ],
    likes: 0,
    views: 0,
    images: [],
  };

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true }),
    });
  });
  await page.route("**/api/drafts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
  await page.route("**/api/posts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(taggedPost),
    });
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "タイムライン", exact: true })
    .first()
    .click();

  const composer = page.locator(".desktop-composer");
  await expect(composer).toBeVisible();
  await composer.getByPlaceholder("いまどうしてる？").fill(taggedPost.body);
  await composer.getByRole("button", { name: "投稿", exact: true }).click();

  const post = page
    .locator("article.post")
    .filter({ hasText: taggedPost.body });
  const autoTagName = "自動タグ 自動タグ候補";
  const autoTag = page.getByLabel(autoTagName);
  await expect(autoTag).toBeVisible();
  await expect(autoTag).toHaveText("AI · 自動タグ候補");
  await expect(autoTag).toHaveAttribute("title", "自動で付与されたタグ");
  await expect(post.getByText("手動タグ", { exact: true })).toBeVisible();

  await post.getByRole("button", { name: autoTagName }).click();
  await expect(page.locator(".filter-active")).toContainText("#自動タグ候補");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(autoTag).toBeVisible();
  await expect(autoTag).toHaveText("AI · 自動タグ候補");

  await page.locator(".filter-active button").click();
  await post.locator(".post-focus").click();
  const detail = page.locator(".detail-page");
  await expect(detail.getByLabel(autoTagName)).toBeVisible();
  await expect(detail.getByText("手動タグ", { exact: true })).toBeVisible();
});
