import { test, expect, type Page } from "@playwright/test";

async function renderBlogDetail(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div class="content-grid">
        <main class="main-content">
          <section class="detail-page">
            <button class="back-button">戻る</button>
            <div class="post-meta">投稿者 · 9/7 <span class="type-label blog">ブログ</span></div>
            <div class="markdown" style="min-height:1800px">
              <h1>架空の記事タイトル</h1>
              <p>架空の記事本文</p>
            </div>
            <div class="tags">tag</div>
            <div class="post-actions">
              <button>♡ 0</button>
              <button>リンクをコピー</button>
              <button>Xで共有</button>
            </div>
          </section>
        </main>
        <aside class="right-sidebar"></aside>
      </div>`;
  });
}

test("desktop blog actions stay beside content while scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await renderBlogDetail(page);

  const actions = page.locator(".post-actions");
  const article = page.locator(".markdown");
  const before = await actions.boundingBox();
  const articleBox = await article.boundingBox();

  expect(before).not.toBeNull();
  expect(articleBox).not.toBeNull();
  if (!before || !articleBox) throw new Error("desktop action rail unavailable");

  expect(before.x + before.width).toBeLessThan(articleBox.x);
  await page.evaluate(() => window.scrollTo(0, 600));
  const after = await actions.boundingBox();
  expect(after).not.toBeNull();
  if (!after) throw new Error("desktop action rail unavailable after scroll");
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  await expect(page.getByRole("button", { name: "リンクをコピー" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xで共有" })).toBeVisible();
});

test("mobile blog actions float above bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await renderBlogDetail(page);

  const actions = page.locator(".post-actions");
  const before = await actions.boundingBox();
  expect(before).not.toBeNull();
  if (!before) throw new Error("mobile floating actions unavailable");

  expect(before.x).toBeGreaterThanOrEqual(12);
  expect(before.x + before.width).toBeLessThanOrEqual(378);
  expect(before.y + before.height).toBeLessThanOrEqual(844 - 70);

  await page.evaluate(() => window.scrollTo(0, 600));
  const after = await actions.boundingBox();
  expect(after).not.toBeNull();
  if (!after) throw new Error("mobile floating actions unavailable after scroll");
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
});
