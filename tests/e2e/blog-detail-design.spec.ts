import { expect, test } from "@playwright/test";
import { Store } from "../../server/storage/local-store.ts";
import { findE2EDataDirectory, removePostFixtures } from "./fixture-store";

const postId = "fictional-blog-design-contract";
const title = "長い記事のタイトルを確認する架空の記事";
const body =
  "本文の始まり\n\n## 導入\n\n導入の本文\n\n### かなり長い見出しでも画面の外へはみ出さずに折り返して読みやすい状態を保つ\n\n見出しの後の本文\n\n#### 詳細\n\n本文の終わり";
let dataDirectory: string;

test.beforeAll(async () => {
  dataDirectory = await findE2EDataDirectory();
  const store = new Store(dataDirectory);
  try {
    store.save("posts", postId, {
      kind: "blog",
      title,
      body,
      date: "2026-11-01T12:00:00.000Z",
      tags: [],
      images: [],
      likes: 0,
      federationEnabled: false,
    });
  } finally {
    store.close();
  }
});

test.afterAll(() => removePostFixtures(dataDirectory, [postId]));

for (const theme of ["light", "dark"] as const) {
  for (const width of [390, 1280]) {
    test(`blog article card and table of contents follow ${theme} appearance at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(`/?post=${postId}`);
      const reader = page.getByRole("dialog", { name: title, exact: true });
      const toc = reader.getByRole("navigation", { name: "目次" });
      await expect(reader).toBeVisible();
      await expect(toc).toBeVisible();
      await expect(toc.getByRole("link")).toHaveCount(3);
      const palette = await page.evaluate(() => {
        const probe = document.createElement("span");
        document.body.append(probe);
        const resolve = (token: string) => {
          probe.style.backgroundColor = `var(${token})`;
          return getComputedStyle(probe).backgroundColor;
        };
        const colors = {
          page: resolve("--ds-color-bg-page"),
          surface: resolve("--ds-color-bg-surface"),
        };
        probe.remove();
        return colors;
      });
      // The real reader has a page-colored TOC on a raised article surface.
      // Border and link-display checks still catch missing imported styles.
      expect(palette.page).not.toBe(palette.surface);
      await expect(toc).toHaveCSS("background-color", palette.page);
      await expect(toc).toHaveCSS("border-top-width", "1px");
      await expect(
        toc.getByRole("link", { name: "導入", exact: true }),
      ).toHaveCSS("display", "block");
      await expect(reader).toHaveCSS("background-color", palette.surface);
      await expect(reader).toHaveCSS(
        "border-top-width",
        width === 390 ? "0px" : "1px",
      );

      const result = await reader.evaluate((element) => {
        const content = element.querySelector('[data-ds="reader-body"]');
        const heading = element.querySelector('[data-ds="detail-markdown"] h1');
        const metadata = element.querySelector(
          '[data-ds="reader-article-header"] [data-ds="post-meta"]',
        );
        const toc = element.querySelector("[data-kamelog-blog-toc]");
        const link = toc?.querySelector("a");
        const paragraph = Array.from(
          element.querySelectorAll('[data-ds="detail-markdown"] p'),
        ).find((entry) => entry.textContent === "本文の始まり");
        if (!content || !heading || !metadata || !toc || !link || !paragraph)
          throw new Error("Article surfaces are incomplete");
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas color conversion is unavailable");
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = Array.from(context.getImageData(0, 0, 1, 1).data)
            .slice(0, 3)
            .map((value) => {
              const channel = value / 255;
              return channel <= 0.04045
                ? channel / 12.92
                : ((channel + 0.055) / 1.055) ** 2.4;
            });
          return (
            channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
          );
        };
        const contrast = (foreground: string, background: string) => {
          const a = luminance(foreground),
            b = luminance(background);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        };
        const box = element.getBoundingClientRect();
        const contentBox = content.getBoundingClientRect();
        const tocBox = toc.getBoundingClientRect();
        return {
          left: box.left,
          right: box.right,
          contentLeft: contentBox.left,
          contentRight: contentBox.right,
          padding: parseFloat(getComputedStyle(content).paddingLeft),
          tocLeft: tocBox.left,
          tocRight: tocBox.right,
          overflow: toc.scrollWidth > toc.clientWidth + 1,
          titleBottom: heading.getBoundingClientRect().bottom,
          metadataTop: metadata.getBoundingClientRect().top,
          metadataBottom: metadata.getBoundingClientRect().bottom,
          tocTop: tocBox.top,
          tocBottom: tocBox.bottom,
          bodyTop: paragraph.getBoundingClientRect().top,
          titleContrast: contrast(
            getComputedStyle(heading).color,
            getComputedStyle(element).backgroundColor,
          ),
          linkContrast: contrast(
            getComputedStyle(link).color,
            getComputedStyle(toc).backgroundColor,
          ),
        };
      });
      expect(result.padding).toBeGreaterThanOrEqual(18);
      expect(result.tocLeft).toBeGreaterThanOrEqual(result.contentLeft);
      expect(result.tocRight).toBeLessThanOrEqual(result.contentRight);
      expect(result.overflow).toBe(false);
      expect(result.titleBottom).toBeLessThanOrEqual(result.metadataTop + 1);
      expect(result.metadataBottom).toBeLessThanOrEqual(result.tocTop + 1);
      expect(result.tocBottom).toBeLessThanOrEqual(result.bodyTop + 1);
      expect(result.titleContrast).toBeGreaterThanOrEqual(4.5);
      expect(result.linkContrast).toBeGreaterThanOrEqual(4.5);
      expect(result.left).toBeGreaterThanOrEqual(0);
      expect(result.right).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    });
  }
}
