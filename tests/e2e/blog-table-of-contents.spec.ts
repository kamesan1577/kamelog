import { expect, test, type Page } from "@playwright/test";
import { Store } from "../../server/storage/local-store.ts";
import { findE2EDataDirectory, removePostFixtures } from "./fixture-store";

const postId = "fictional-toc-contract-blog";
const title = "目次を確認する架空の記事";
const body =
  "冒頭本文\n\n## 導入\n\n導入本文\n\n### **詳細**\n\n詳細本文\n\n#### 補足\n\n補足本文\n\n##### 条件\n\n条件本文\n\n###### `例`\n\n例本文\n\n## 導入\n\n重複した見出しの本文";
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

async function openArticle(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?post=${postId}`);
  await expect(
    page.getByRole("dialog", { name: title, exact: true }),
  ).toBeVisible();
}

async function expectGeneratedToc(page: Page) {
  const toc = page.getByRole("navigation", { name: "目次" });
  const reader = page.getByRole("dialog", { name: title, exact: true });
  await expect(toc).toHaveCount(1);
  await expect(toc).toBeVisible();
  await expect(toc.getByRole("link")).toHaveText([
    "導入",
    "詳細",
    "補足",
    "条件",
    "例",
    "導入",
  ]);
  const entries = [
    { level: 2, id: "kamelog-toc-導入" },
    { level: 3, id: "kamelog-toc-詳細" },
    { level: 4, id: "kamelog-toc-補足" },
    { level: 5, id: "kamelog-toc-条件" },
    { level: 6, id: "kamelog-toc-例" },
    { level: 2, id: "kamelog-toc-導入-2" },
  ];
  for (const [index, entry] of entries.entries()) {
    const href = await toc.getByRole("link").nth(index).getAttribute("href");
    expect(href).toMatch(/^#/);
    expect(decodeURIComponent(href!.slice(1))).toBe(entry.id);
    await expect(
      reader.locator(`h${entry.level}[id="${entry.id}"]`),
    ).toHaveCount(1);
  }
  await expect(
    reader.locator('[data-ds="detail-markdown"] h1'),
  ).not.toHaveAttribute("id", /.+/);
  await expect(
    reader.locator('[data-ds="reader-article-header"]'),
  ).toContainText(title);
  await expect(
    reader
      .locator('[data-ds="reader-article-header"]')
      .getByRole("navigation", { name: "目次" }),
  ).toHaveCount(1);
}

test("blog detail generates a table of contents from h2-h6 headings", async ({
  page,
}) => {
  await openArticle(page, 1280);
  await expectGeneratedToc(page);
  const originalUrl = page.url();
  const historyLength = await page.evaluate(() => history.length);
  await page
    .getByRole("navigation", { name: "目次" })
    .getByRole("link", { name: "導入", exact: true })
    .last()
    .click();
  await expect(page.locator('[id="kamelog-toc-導入-2"]')).toBeInViewport();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await expect(page).toHaveURL(originalUrl);
  await page.getByRole("button", { name: "投稿を閉じる", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "目次" })).toHaveCount(0);
  await openArticle(page, 1280);
  await expectGeneratedToc(page);
});

test("blog table of contents renders between article metadata and body on desktop", async ({
  page,
}) => {
  await openArticle(page, 1280);
  await expectGeneratedToc(page);
  const geometry = await page
    .locator('[data-ds="detail-markdown"]')
    .evaluate((markdown) => {
      const heading = markdown.querySelector("h1");
      const metadata = markdown.querySelector('[data-ds="post-meta"]');
      const toc = markdown.querySelector("[data-kamelog-blog-toc]");
      const firstParagraph = Array.from(markdown.querySelectorAll("p")).find(
        (element) => element.textContent === "冒頭本文",
      );
      if (!heading || !metadata || !toc || !firstParagraph)
        throw new Error("Article header and body are incomplete");
      return {
        titleBottom: heading.getBoundingClientRect().bottom,
        metadataTop: metadata.getBoundingClientRect().top,
        metadataBottom: metadata.getBoundingClientRect().bottom,
        tocTop: toc.getBoundingClientRect().top,
        tocBottom: toc.getBoundingClientRect().bottom,
        bodyTop: firstParagraph.getBoundingClientRect().top,
      };
    });
  expect(geometry.titleBottom).toBeLessThanOrEqual(geometry.metadataTop + 1);
  expect(geometry.metadataBottom).toBeLessThanOrEqual(geometry.tocTop + 1);
  expect(geometry.tocBottom).toBeLessThanOrEqual(geometry.bodyTop + 1);
});

test("blog table of contents stays inside a 390px viewport", async ({
  page,
}) => {
  await openArticle(page, 390);
  await expectGeneratedToc(page);
  const toc = page.getByRole("navigation", { name: "目次" });
  const box = await toc.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(
    await toc.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
