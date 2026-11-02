import { expect, test, type Page } from "@playwright/test";
import { Store } from "../../server/storage/local-store.ts";
import { findE2EDataDirectory, removePostFixtures } from "./fixture-store";

const blogId = "fictional-page-reader-blog";
const tweetId = "fictional-page-reader-tweet";
const vlogId = "fictional-page-reader-vlog";
const title = "ページで読むための架空の記事";
const paragraphs = Array.from(
  { length: 12 },
  (_, index) =>
    `${index + 1}段落目。これはページ表示とスクロールを検証する架空の本文です。記事の内容と表示方法は分けて扱います。`,
).join("\n\n");
const body = ["導入", "途中の節", "最終節"]
  .map((heading) => `## ${heading}\n\n${paragraphs}`)
  .join("\n\n");
let dataDirectory: string;

test.beforeAll(async () => {
  dataDirectory = await findE2EDataDirectory();
  const store = new Store(dataDirectory);
  try {
    const common = {
      date: "2026-11-01T12:00:00.000Z",
      tags: ["架空のページ検証"],
      images: [],
      likes: 0,
      views: 0,
      federationEnabled: false,
    };
    for (const post of [
      { id: blogId, kind: "blog", title, body },
      { id: tweetId, kind: "tweet", title: "", body: "架空のつぶやき" },
      {
        id: vlogId,
        kind: "vlog",
        title: "",
        body: "架空の動画",
        video: "/flower.mp4",
        time: "12:00",
      },
    ])
      store.save("posts", post.id, { ...common, ...post });
  } finally {
    store.close();
  }
});

test.afterAll(() =>
  removePostFixtures(dataDirectory, [blogId, tweetId, vlogId]),
);

function article(page: Page) {
  return page.locator(
    'article[data-ds="post-reader"][data-presentation="page"]',
  );
}

function popup(page: Page) {
  return page.getByRole("dialog", { name: title, exact: true });
}

function expectPostUrl(href: string, mode: "popup" | "page", source?: string) {
  const url = new URL(href, "https://example.test");
  expect(url.pathname).toBe("/");
  expect(url.searchParams.get("post")).toBe(blogId);
  expect(url.searchParams.get("reader")).toBe(mode === "page" ? "page" : null);
  if (source) expect(url.searchParams.get("source")).toBe(source);
}

function currentViews() {
  const store = new Store(dataDirectory);
  try {
    return Number(store.get("posts", blogId)?.views || 0);
  } finally {
    store.close();
  }
}

for (const width of [390, 1280]) {
  test(`blog page uses document scrolling, accessible navigation and adaptive colors at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`/?post=${blogId}&reader=page`);
    const reader = article(page);
    const progress = reader.getByRole("progressbar", { name: "読書進捗" });
    await expect(reader).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main").locator("article")).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator('[data-ds="reader-overlay"]')).toHaveCount(0);
    await expect(reader).not.toHaveAttribute("aria-modal", "true");
    await expect(page.locator("body")).not.toHaveAttribute(
      "data-scroll-locked",
    );
    await expect(reader).not.toHaveCSS("position", "fixed");
    await expect(progress).toHaveAttribute("aria-valuenow", "0");

    const theme = page.getByRole("combobox", {
      name: "表示テーマ",
      exact: true,
    });
    await theme.focus();
    await expect(theme).toBeFocused();
    const pageUrl = page.url();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(pageUrl);
    await expect(reader).toBeVisible();
    const heading = reader.getByRole("heading", { name: title, exact: true });
    const darkInk = await heading.evaluate(
      (element) => getComputedStyle(element).color,
    );
    await theme.selectOption("light");
    await expect(heading).not.toHaveCSS("color", darkInk);
    await theme.selectOption("dark");
    await expect(heading).toHaveCSS("color", darkInk);
    await page.screenshot({
      path: testInfo.outputPath(`blog-page-${width}-dark-top.png`),
    });

    const historyLength = await page.evaluate(() => history.length);
    await reader
      .getByRole("navigation", { name: "目次" })
      .getByRole("link", { name: "最終節", exact: true })
      .click();
    const lastHeading = reader.getByRole("heading", {
      name: "最終節",
      exact: true,
    });
    await expect(lastHeading).toBeInViewport();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
    const position = await lastHeading.evaluate((element) => {
      const header = element
        .closest('[data-ds="post-reader"]')
        ?.querySelector('[data-ds="reader-header"]');
      return {
        headingTop: element.getBoundingClientRect().top,
        headerBottom: header?.getBoundingClientRect().bottom || 0,
      };
    });
    expect(position.headingTop).toBeGreaterThanOrEqual(
      Math.max(0, position.headerBottom) - 1,
    );
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(page).toHaveURL(pageUrl);
    expect(
      await page
        .locator('[data-ds="site-layout"]')
        .evaluate((element) => element.scrollTop),
    ).toBe(0);
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    await expect(progress).toHaveAttribute("aria-valuenow", "100");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`blog-page-${width}-dark.png`),
    });
  });
}

test("default popup and page links preserve URL history without remembering a global reader preference", async ({
  page,
}) => {
  const beforeViews = currentViews();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/timeline?source=page-reader-fixture");
  const trigger = page.locator('[data-ds="post-preview"]').filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
  await trigger.click();
  await expect(popup(page)).toBeVisible();
  await expect.poll(currentViews).toBe(beforeViews + 1);
  const pageLink = popup(page).getByRole("link", {
    name: "ページで読む",
    exact: true,
  });
  expectPostUrl(
    (await pageLink.getAttribute("href"))!,
    "page",
    "page-reader-fixture",
  );
  await pageLink.click();
  await expect(article(page)).toBeVisible();
  expectPostUrl(page.url(), "page", "page-reader-fixture");
  await expect(popup(page)).toHaveCount(0);
  await page.reload();
  await expect(article(page)).toBeVisible();
  expectPostUrl(page.url(), "page", "page-reader-fixture");
  expect(currentViews()).toBe(beforeViews + 1);
  await page.goBack();
  await expect(popup(page)).toBeVisible();
  expectPostUrl(page.url(), "popup", "page-reader-fixture");
  await page.goForward();
  await expect(article(page)).toBeVisible();
  const popupLink = article(page).getByRole("link", {
    name: "ポップアップで読む",
    exact: true,
  });
  expectPostUrl(
    (await popupLink.getAttribute("href"))!,
    "popup",
    "page-reader-fixture",
  );
  await popupLink.click();
  await expect(popup(page)).toBeVisible();
  expectPostUrl(page.url(), "popup", "page-reader-fixture");
  await page.goBack();
  await expect(article(page)).toBeVisible();
  await page
    .getByRole("button", { name: "プロジェクト", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\?source=page-reader-fixture$/);
  await page.goBack();
  await expect(article(page)).toBeVisible();
  await page
    .getByRole("button", { name: "タイムライン", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/timeline\?source=page-reader-fixture$/);
  await trigger.click();
  await expect(popup(page)).toBeVisible();
  expectPostUrl(page.url(), "popup", "page-reader-fixture");
  expect(currentViews()).toBe(beforeViews + 1);
  expect(errors).toEqual([]);
});

test("the native page link supports opening a separate tab", async ({
  page,
  context,
}) => {
  await page.goto(`/?post=${blogId}`);
  const pageLink = popup(page).getByRole("link", {
    name: "ページで読む",
    exact: true,
  });
  await expect(pageLink).toBeVisible();
  // Browser modifier-clicks open tabs without a JavaScript popup opener.
  const opened = context.waitForEvent("page");
  await pageLink.click({
    modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
  });
  const nextPage = await opened;
  try {
    await expect(article(nextPage)).toBeVisible();
    expectPostUrl(nextPage.url(), "page");
    await expect(popup(page)).toBeVisible();
    expectPostUrl(page.url(), "popup");
  } finally {
    await nextPage.close();
  }
});

test("Back restores the article reading position after navigating to another view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?post=${blogId}&reader=page&source=scroll-restore`);
  await expect(article(page)).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(800);
  const readingPosition = await page.evaluate(() => window.scrollY);
  await page
    .getByRole("button", { name: "プロジェクト", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/projects\?source=scroll-restore$/);
  await expect(page.locator('[data-ds="projects-page"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.goBack();
  await expect(article(page)).toBeVisible();
  expectPostUrl(page.url(), "page", "scroll-restore");
  await expect
    .poll(async () =>
      Math.abs((await page.evaluate(() => window.scrollY)) - readingPosition),
    )
    .toBeLessThanOrEqual(2);
  await page.goForward();
  await expect(page).toHaveURL(/\/projects\?source=scroll-restore$/);
  await expect(page.locator('[data-ds="projects-page"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("direct page URLs render an article without JavaScript and retain canonical SEO", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    colorScheme: "dark",
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(
      `/?post=${blogId}&reader=page&source=direct`,
    );
    expect(response?.status()).toBe(200);
    const reader = article(page);
    await expect(reader).toBeVisible();
    await expect(
      reader.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    await expect(reader).toContainText(
      "記事の内容と表示方法は分けて扱います。",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const toc = reader.getByRole("navigation", { name: "目次" });
    await expect(toc).toBeVisible();
    await expect(toc.getByRole("link")).toHaveCount(3);
    for (const name of ["導入", "途中の節", "最終節"]) {
      const link = toc.getByRole("link", { name, exact: true });
      await expect(link).toHaveAttribute("href", /^#/);
      const href = (await link.getAttribute("href"))!;
      const id = decodeURIComponent(
        new URL(href, "https://example.test").hash.slice(1),
      );
      await expect(
        reader.getByRole("heading", { name, exact: true }),
      ).toHaveAttribute("id", id);
    }
    const lastHeading = reader.getByRole("heading", {
      name: "最終節",
      exact: true,
    });
    await toc.getByRole("link", { name: "最終節", exact: true }).click();
    expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(
      await lastHeading.getAttribute("id"),
    );
    await expect(lastHeading).toBeInViewport();
    const popupLink = reader.getByRole("link", {
      name: "ポップアップで読む",
      exact: true,
    });
    expectPostUrl((await popupLink.getAttribute("href"))!, "popup", "direct");
    await expect(page).toHaveTitle(`${title} | kamelog`);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const canonicalUrl = new URL((await canonical.getAttribute("href"))!);
    expectPostUrl(canonicalUrl.href, "popup");
    expect([...canonicalUrl.searchParams.keys()]).toEqual(["post"]);
    expect(canonicalUrl.hash).toBe("");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      canonicalUrl.href,
    );
    const structured = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    expect(
      structured.some((value) => value.includes('"@type":"BlogPosting"')),
    ).toBe(true);
    await popupLink.click();
    expectPostUrl(page.url(), "popup", "direct");
    await expect(
      page.locator('[data-ds="post-reader-fallback"]'),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("sharing from the page keeps the canonical post URL", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/?post=${blogId}&reader=page&source=share`);
  const reader = article(page);
  await reader
    .getByRole("button", { name: "リンクをコピー", exact: true })
    .click();
  const copied = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expectPostUrl(copied.href, "popup");
  expect([...copied.searchParams.keys()]).toEqual(["post"]);
  await context.route("https://twitter.com/intent/tweet?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Fictional share destination</title>",
    }),
  );
  const opened = page.waitForEvent("popup");
  await reader.getByRole("button", { name: "Xで共有", exact: true }).click();
  const shared = await opened;
  try {
    await expect(shared).toHaveURL(/^https:\/\/twitter\.com\/intent\/tweet\?/);
    const url = new URL(new URL(shared.url()).searchParams.get("url")!);
    expectPostUrl(url.href, "popup");
    expect([...url.searchParams.keys()]).toEqual(["post"]);
  } finally {
    await shared.close();
  }
});

for (const post of [
  { id: blogId, reader: "invalid" },
  { id: tweetId, reader: "page" },
  { id: vlogId, reader: "page" },
]) {
  test(`unsupported page mode stays a popup for ${post.id} with reader=${post.reader}`, async ({
    page,
  }) => {
    await page.goto(`/?post=${post.id}&reader=${post.reader}`);
    const reader = page.locator('[data-ds="post-reader"]');
    await expect(reader).toHaveAttribute("role", "dialog");
    await expect(article(page)).toHaveCount(0);
    if (post.id !== blogId)
      await expect(
        reader.getByRole("link", { name: "ページで読む", exact: true }),
      ).toHaveCount(0);
  });
}

test("owner editing from a page returns to the article after closing the editor", async ({
  page,
  context,
  baseURL,
}) => {
  const store = new Store(dataDirectory);
  let session: string;
  try {
    session = store.createSession();
  } finally {
    store.close();
  }
  await context.addCookies([
    { name: "kamelog-session", value: session, url: baseURL! },
  ]);
  await page.goto(`/?post=${blogId}&reader=page`);
  const reader = article(page);
  await reader.getByRole("button", { name: "その他", exact: true }).click();
  await page.getByRole("menuitem", { name: "編集", exact: true }).click();
  const editor = page.locator('[data-ds="editor-dialog"]');
  const input = editor.getByPlaceholder("本文", { exact: true });
  await expect(input).toHaveValue(body);
  const unsaved = body + "\n\n保存しない架空の変更。";
  await input.fill(unsaved);
  await input.press("Escape");
  const confirmation = page.getByRole("dialog").filter({
    has: page.getByRole("heading", { name: "この投稿を保存しますか？" }),
  });
  await confirmation
    .getByRole("button", { name: "編集を続ける", exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(input).toHaveValue(unsaved);
  await input.press("Escape");
  await confirmation
    .getByRole("button", { name: "削除して閉じる", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(reader).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectPostUrl(page.url(), "page");
  await expect(page.locator("body")).not.toHaveAttribute("data-scroll-locked");
  await expect(reader).not.toContainText("保存しない架空の変更。");
});
