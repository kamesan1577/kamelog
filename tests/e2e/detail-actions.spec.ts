import { test, expect } from "@playwright/test";

test("blog detail actions stay above article content", async ({ page }) => {
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => {
      document.body.innerHTML = `
        <main class="main-content">
          <section class="detail-page">
            <button class="back-button">戻る</button>
            <div class="post-meta">投稿者 · 9/7 <span class="type-label blog">ブログ</span></div>
            <div class="markdown"><h1>架空の記事タイトル</h1><p>架空の記事本文</p></div>
            <div class="tags">tag</div>
            <div class="post-actions">
              <button>0</button>
              <button>リンクをコピー</button>
              <button>Xで共有</button>
            </div>
          </section>
        </main>`;
    });

    const meta = await page.locator(".post-meta").boundingBox();
    const actions = await page.locator(".post-actions").boundingBox();
    const article = await page.locator(".markdown").boundingBox();
    const linkCopy = page.getByRole("button", { name: "リンクをコピー" });
    const xShare = page.getByRole("button", { name: "Xで共有" });

    expect(meta).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(article).not.toBeNull();
    if (!meta || !actions || !article) {
      throw new Error("blog detail action geometry unavailable");
    }

    expect(actions.y).toBeGreaterThan(meta.y);
    expect(actions.y + actions.height).toBeLessThanOrEqual(article.y + 1);
    await expect(linkCopy).toBeVisible();
    await expect(xShare).toBeVisible();
  }
});
