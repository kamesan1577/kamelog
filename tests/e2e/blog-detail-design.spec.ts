import { expect, test, type Page } from "@playwright/test";

async function addBlogDetailFixture(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    const fixture = document.createElement("section");
    fixture.id = "blog-detail-design-fixture";
    fixture.className = "detail-page";
    fixture.dataset.ds = "detail-page";
    fixture.innerHTML = `
      <button class="back-button">戻る</button>
      <div>
        <div data-ds="post-meta" class="post-meta">架空の投稿者 · 9/7</div>
        <div data-ds="detail-markdown" class="markdown">
          <h1>長い記事のタイトル</h1>
          <p>本文</p>
          <h2>導入</h2>
          <h3>かなり長い見出しでも画面の外へはみ出さずに折り返して読みやすい状態を保つ</h3>
          <h4>詳細</h4>
        </div>
        <div data-ds="post-actions" class="post-actions">記事の操作</div>
      </div>
    `;
    const main = document.querySelector("main.main-content") || document.body;
    main.append(fixture);
  });
}

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    test(`blog article card and table of contents follow ${theme} appearance at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await addBlogDetailFixture(page);

      const palette = await page.evaluate(() => {
        const probe = document.createElement("span");
        document.body.append(probe);
        const resolve = (token: string) => {
          probe.style.backgroundColor = `var(${token})`;
          return getComputedStyle(probe).backgroundColor;
        };
        const colors = {
          muted: resolve("--ds-color-bg-muted"),
          surface: resolve("--ds-color-bg-surface"),
          primary: resolve("--ds-color-text-primary"),
        };
        probe.remove();
        return colors;
      });

      const card = page.locator("#blog-detail-design-fixture > div");
      const toc = page.getByRole("navigation", { name: "目次" });
      await expect(toc).toBeVisible();
      await expect(toc.getByRole("link")).toHaveCount(3);

      // Regression: missing TOC CSS left an unstyled, oversized list. Surfaces
      // now use the shared theme tokens; geometry and imported styles still apply.
      expect(palette.muted).not.toBe(palette.surface);
      await expect(toc).toHaveCSS("background-color", palette.muted);
      await expect(toc).toHaveCSS("border-top-width", "1px");
      await expect(toc.getByRole("link", { name: "導入" })).toHaveCSS(
        "display",
        "block",
      );
      await expect(toc.getByRole("link", { name: "導入" })).toHaveCSS(
        "color",
        palette.primary,
      );
      await expect(card).toHaveCSS("background-color", palette.surface);
      await expect(card).toHaveCSS("border-top-width", "1px");

      const geometry = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>(
          "#blog-detail-design-fixture > div",
        );
        const toc = document.querySelector<HTMLElement>(
          "#blog-detail-design-fixture [data-kamelog-blog-toc]",
        );
        if (!card || !toc) return null;
        const cardBounds = card.getBoundingClientRect();
        const tocBounds = toc.getBoundingClientRect();
        return {
          cardX: cardBounds.left,
          cardRight: cardBounds.right,
          tocX: tocBounds.left,
          tocRight: tocBounds.right,
          cardPadding: parseFloat(getComputedStyle(card).paddingLeft),
          horizontalOverflow: toc.scrollWidth > toc.clientWidth + 1,
        };
      });
      expect(geometry).not.toBeNull();
      expect(geometry!.cardPadding).toBeGreaterThanOrEqual(18);
      expect(geometry!.tocX).toBeGreaterThanOrEqual(geometry!.cardX);
      expect(geometry!.tocRight).toBeLessThanOrEqual(geometry!.cardRight);
      expect(geometry!.horizontalOverflow).toBe(false);
      if (width === 390) {
        expect(geometry!.cardX).toBeGreaterThanOrEqual(0);
        expect(geometry!.cardRight).toBeLessThanOrEqual(width);
      }
    });
  }
}
