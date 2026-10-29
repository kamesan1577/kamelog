import { access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { Store } from "../../server/store.mjs";

const blogId = "fictional-reader-blog";
const tweetId = "fictional-reader-tweet";
const vlogId = "fictional-reader-vlog";
const growthId = "fictional-reader-growth";
const blogTitle = "閲覧画面を確認する架空の記事";
const paragraphs = Array.from(
  { length: 12 },
  (_, index) =>
    `${index + 1}段落目。これは閲覧画面のスクロールを確認するための架空の文章です。本文と操作ボタンの位置を確認します。`,
).join("\n\n");
const blogBody = ["導入", "中盤", "まとめ"]
  .map((heading) => `## ${heading}\n\n${paragraphs}`)
  .join("\n\n");
let dataDirectory: string;

async function findE2EDataDirectory() {
  const candidates = await Promise.all(
    (await readdir(tmpdir(), { withFileTypes: true }))
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith("kamelog-e2e-"),
      )
      .map(async (entry) => {
        const path = join(tmpdir(), entry.name);
        return { path, mtimeMs: (await stat(path)).mtimeMs };
      }),
  );
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const candidate of candidates) {
    try {
      await access(join(candidate.path, "kamelog.sqlite"));
      return candidate.path;
    } catch {
      // A previous interrupted run may leave an empty temporary directory.
    }
  }
  throw new Error("active kamelog E2E data directory not found");
}

test.beforeAll(async () => {
  dataDirectory = await findE2EDataDirectory();
  const store = new Store(dataDirectory);
  try {
    const common = {
      date: "2026-10-01T12:00:00.000Z",
      tags: ["架空の閲覧テスト"],
      images: [],
      likes: 0,
      federationEnabled: false,
    };
    for (const post of [
      { id: blogId, kind: "blog", title: blogTitle, body: blogBody },
      {
        id: tweetId,
        kind: "tweet",
        title: "",
        body: "閲覧画面を確認する架空のつぶやき",
        images: ["/favicon.svg"],
      },
      {
        id: vlogId,
        kind: "vlog",
        title: "",
        body: "閲覧画面を確認する架空の動画",
        video: "/flower.mp4",
        time: "12:00",
      },
      {
        id: growthId,
        kind: "blog",
        title: "画像読み込みを確認する架空の記事",
        body: `${blogBody}\n\n![遅れて読み込む確認画像](/reader-growth.svg)`,
      },
    ]) {
      store.save("posts", post.id, { ...common, ...post });
    }
  } finally {
    store.close();
  }
});

test.afterAll(() => {
  if (!dataDirectory) return;
  const store = new Store(dataDirectory);
  try {
    for (const id of [blogId, tweetId, vlogId, growthId]) {
      const post = store.get("posts", id);
      if (post) store.remove("posts", id, post.revision);
    }
  } finally {
    store.close();
  }
});

function reader(page: Page) {
  return page.locator('[data-ds="post-reader"]');
}

async function scrollToEnd(surface: Locator) {
  await surface.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
  });
}

async function expectProgressMatchesScroll(page: Page) {
  await expect
    .poll(async () => {
      const expected = await page
        .locator('[data-ds="reader-scroll"]')
        .evaluate((element) => {
          const range = element.scrollHeight - element.clientHeight;
          return range > 0
            ? Math.round((element.scrollTop / range) * 100)
            : 100;
        });
      const actual = Number(
        await page
          .locator('[data-ds="reading-progress"]')
          .getAttribute("aria-valuenow"),
      );
      return Math.abs(expected - actual);
    })
    .toBeLessThanOrEqual(1);
}

for (const width of [390, 1280]) {
  test(`article reader keeps its controls visible and scrolls its TOC at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?post=${blogId}`);
    const dialog = reader(page);
    const scroll = dialog.locator('[data-ds="reader-scroll"]');
    const actions = dialog.locator('[data-ds="reader-actions"]');
    const progress = dialog.locator('[data-ds="reading-progress"]');
    const close = dialog.getByRole("button", { name: "投稿を閉じる" });
    await expect(dialog).toHaveAttribute("role", "dialog");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(close).toBeFocused();
    await expect(dialog).toHaveCSS("opacity", "1");
    await expect(dialog).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(dialog.locator('[data-ds="detail-markdown"] h1')).toHaveText(
      blogTitle,
    );
    await expect(progress).toHaveAttribute("aria-valuenow", "0");
    await expect(dialog.getByRole("button", { name: "その他" })).toHaveCount(0);
    await expect(page.locator('[data-ds="inline-composer"]')).toHaveCount(0);
    await expect(page.locator('[data-ds="mobile-create"]')).toHaveCount(0);

    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    if (width === 390) {
      expect(bounds!.x).toBe(0);
      expect(bounds!.y).toBe(0);
      expect(bounds!.width).toBe(width);
      expect(bounds!.height).toBe(900);
    } else {
      expect(bounds!.width).toBe(900);
      expect(bounds!.height).toBeLessThanOrEqual(900 - 64);
      expect(bounds!.x).toBeGreaterThan(0);
      expect(bounds!.y).toBeGreaterThan(0);
    }
    await page.screenshot({
      animations: "disabled",
      path: `ui-evidence/post-reader-article-top-${width}.png`,
    });
    const initialActions = await actions.boundingBox();
    const location = page.url();
    const historyLength = await page.evaluate(() => history.length);
    const backgroundScroll = await page
      .locator('[data-ds="site-layout"]')
      .evaluate((element) => element.scrollTop);
    const toc = dialog.getByRole("navigation", { name: "目次" });
    await expect(toc.getByRole("link")).toHaveCount(3);
    await toc.getByRole("link", { name: "中盤", exact: true }).click();
    await expect(
      dialog.getByRole("heading", { name: "中盤", exact: true }),
    ).toBeInViewport();
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await expectProgressMatchesScroll(page);
    expect(page.url()).toBe(location);
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    expect(
      await page
        .locator('[data-ds="site-layout"]')
        .evaluate((element) => element.scrollTop),
    ).toBe(backgroundScroll);

    await scrollToEnd(scroll);
    await expect(progress).toHaveAttribute("aria-valuenow", "100");
    await expect(close).toBeInViewport();
    for (const label of ["リンクをコピー", "Xで共有"]) {
      await expect(
        actions.getByRole("button", { name: label }),
      ).toBeInViewport();
    }
    const finalActions = await actions.boundingBox();
    expect(initialActions).not.toBeNull();
    expect(finalActions).not.toBeNull();
    expect(Math.abs(finalActions!.y - initialActions!.y)).toBeLessThanOrEqual(
      1,
    );
    expect(finalActions!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(finalActions!.x + finalActions!.width).toBeLessThanOrEqual(
      bounds!.x + bounds!.width,
    );
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: `ui-evidence/post-reader-article-${width}.png`,
    });

    for (const [id, selector, text] of [
      [tweetId, '[data-ds="tweet-body"]', "閲覧画面を確認する架空のつぶやき"],
      [vlogId, '[data-ds="vlog-caption"]', "閲覧画面を確認する架空の動画"],
    ]) {
      await page.goto(`/?post=${id}`);
      await expect(reader(page).locator(selector)).toHaveText(text);
      await expect(
        reader(page).getByRole("button", { name: "投稿を閉じる" }),
      ).toBeInViewport();
      expect(
        await reader(page).evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      if (id === vlogId) {
        const video = reader(page).locator("video");
        await expect(video).toHaveAttribute("controls", "");
        const box = await video.boundingBox();
        expect(box).not.toBeNull();
        expect(
          Math.abs(box!.height - (box!.width * 9) / 16),
        ).toBeLessThanOrEqual(1);
      }
      await page.screenshot({
        animations: "disabled",
        path: `ui-evidence/post-reader-${id === tweetId ? "tweet" : "vlog"}-${width}.png`,
      });
    }
  });
}

test("reader keeps URL history, keyboard focus, and article actions working", async ({
  page,
  context,
  baseURL,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/timeline?reader-fixture=preserved");
  const trigger = page.locator('[data-ds="post-preview"]').filter({
    has: page.getByRole("heading", { name: blogTitle, exact: true }),
  });
  await trigger.focus();
  await trigger.press("Enter");
  const close = reader(page).getByRole("button", { name: "投稿を閉じる" });
  await expect(close).toBeFocused();
  expect(new URL(page.url()).searchParams.get("post")).toBe(blogId);
  expect(new URL(page.url()).searchParams.get("reader-fixture")).toBe(
    "preserved",
  );
  const actions = reader(page).locator('[data-ds="reader-actions"]');
  const like = actions.getByRole("button").first();
  await expect(like).toHaveText("0");
  await like.click();
  await expect(like).toHaveText("1");
  await actions.getByRole("button", { name: "リンクをコピー" }).click();
  const copied = new URL(
    await page.evaluate(() => navigator.clipboard.readText()),
  );
  expect(copied.searchParams.get("post")).toBe(blogId);
  await context.route("https://twitter.com/intent/tweet?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Share fixture</title>",
    }),
  );
  const popupPromise = page.waitForEvent("popup");
  await actions.getByRole("button", { name: "Xで共有" }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/^https:\/\/twitter\.com\/intent\/tweet\?/);
  expect(
    new URL(new URL(popup.url()).searchParams.get("url")!).searchParams.get(
      "post",
    ),
  ).toBe(blogId);
  await popup.close();
  await close.focus();
  await close.press("Escape");
  await expect(reader(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(`${baseURL}/timeline?reader-fixture=preserved`);
  await page.goForward();
  await expect(reader(page)).toBeVisible();
  await page.goBack();
  await expect(reader(page)).toHaveCount(0);
  await page.goto(`/projects?post=${blogId}&reader-fixture=preserved`);
  await expect(reader(page)).toBeVisible();
  await reader(page).getByRole("button", { name: "投稿を閉じる" }).click();
  expect(new URL(page.url()).searchParams.has("post")).toBe(false);
  expect(new URL(page.url()).searchParams.get("reader-fixture")).toBe(
    "preserved",
  );
  await expect(
    page.getByRole("heading", { name: /かめさん.*Backend Engineer/ }),
  ).toBeVisible();
});

test("reading progress follows late image growth and viewport resizing", async ({
  page,
}) => {
  let releaseImage: () => void = () => {};
  const imageReady = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  await page.route("**/reader-growth.svg", async (route) => {
    await imageReady;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="1600"><rect width="640" height="1600" fill="#eee"/></svg>',
    });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?post=${growthId}`, { waitUntil: "domcontentloaded" });
  const scroll = reader(page).locator('[data-ds="reader-scroll"]');
  await expect(scroll).toBeVisible();
  await scroll.evaluate((element) =>
    element.scrollTo({
      top: (element.scrollHeight - element.clientHeight) / 2,
      behavior: "instant",
    }),
  );
  await expectProgressMatchesScroll(page);
  const before = await scroll.evaluate((element) => element.scrollHeight);
  releaseImage();
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollHeight))
    .toBeGreaterThan(before + 1000);
  await expectProgressMatchesScroll(page);
  await page.setViewportSize({ width: 390, height: 700 });
  await expectProgressMatchesScroll(page);
  await scrollToEnd(scroll);
  await expect(
    reader(page).locator('[data-ds="reading-progress"]'),
  ).toHaveAttribute("aria-valuenow", "100");
});

test("article direct links include readable content without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(`/?post=${blogId}`);
    expect(response?.status()).toBe(200);
    const article = page.locator('[data-ds="detail-markdown"]');
    await expect(
      article.getByRole("heading", { name: blogTitle, exact: true }),
    ).toBeVisible();
    await expect(article).toContainText("本文と操作ボタンの位置を確認します。");
    await expect(
      article.getByRole("heading", { name: "中盤", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("nested image, owner menu, and unsaved reply do not dismiss the reader", async ({
  page,
  context,
  baseURL,
}) => {
  const store = new Store(dataDirectory);
  const session = store.createSession();
  store.close();
  await context.addCookies([
    { name: "kamelog-session", value: session, url: baseURL! },
  ]);
  await page.goto(`/?post=${tweetId}`);
  const dialog = reader(page);
  const imageTrigger = dialog.getByRole("button", { name: "画像1を拡大" });
  await imageTrigger.click();
  const lightbox = page.locator('[data-ds="media-gallery-lightbox"]');
  await expect(lightbox).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(
    lightbox.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(imageTrigger).toBeFocused();
  await dialog.getByRole("button", { name: "その他" }).press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "編集", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "続きをつなげる" }).click();
  const reply = dialog.getByPlaceholder("続きのつぶやき");
  await reply.fill("まだ保存していない架空の返信");
  const confirm = page.getByRole("dialog", { name: "返信を閉じる" });
  for (const dismiss of [
    () => reply.press("Escape"),
    () => dialog.getByRole("button", { name: "投稿を閉じる" }).click(),
  ]) {
    await dismiss();
    await expect(confirm).toBeVisible();
    await expect(dialog).toBeVisible();
    await confirm.getByRole("button", { name: "編集を続ける" }).click();
    await expect(reply).toHaveValue("まだ保存していない架空の返信");
    expect(new URL(page.url()).searchParams.get("post")).toBe(tweetId);
  }
  await reply.press("Escape");
  await confirm.getByRole("button", { name: "破棄", exact: true }).click();
  await expect(reply).toHaveCount(0);
  await dialog.getByRole("button", { name: "投稿を閉じる" }).click();
  await expect(dialog).toHaveCount(0);
});
