import { access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Locator } from "@playwright/test";
import { Store } from "../../server/store.mjs";

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
      // Ignore stale temporary directories that do not contain the active DB.
    }
  }
  throw new Error("active kamelog E2E data directory not found");
}

async function expectDividerAligned(childPost: Locator) {
  const divider = await childPost.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    const bounds = element.getBoundingClientRect();
    const feed = element.closest(".feed")?.getBoundingClientRect();
    return {
      left: bounds.left + parseFloat(style.left),
      feedLeft: feed?.left,
      thickness: style.height,
      color: style.backgroundColor,
    };
  });
  expect(divider.feedLeft).toBeDefined();
  expect(Math.abs(divider.left - divider.feedLeft!)).toBeLessThanOrEqual(1);
  expect(divider.thickness).toBe("1px");
  expect(divider.color).not.toBe("rgba(0, 0, 0, 0)");
}

test("owner can append a tweet thread and public detail renders the chain", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  const store = new Store(await findE2EDataDirectory());
  const session = store.createSession();
  store.close();
  await context.addCookies([
    {
      name: "kamelog-session",
      value: session, url: "http://localhost:3000" },
  ]);

  await page.goto("/");
  await page
    .getByRole("button", { name: "タイムライン", exact: true })
    .first()
    .click();
  const imagePicker = page.locator(".desktop-composer .image-upload-button");
  await expect(imagePicker).toBeVisible();
  await expect(imagePicker).toHaveText(/画像/);
  await expect(imagePicker).toHaveCSS("font-size", "0px");
  await expect(imagePicker.locator("svg")).toHaveCSS("width", "20px");
  await expect(imagePicker.locator("svg")).toHaveCSS("height", "20px");
  await expect(imagePicker.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    "image/png,image/jpeg,image/webp,image/gif",
  );

  const inline = page.getByPlaceholder("いまどうしてる？");
  await inline.fill("スレッドの架空ルート投稿");
  await page.getByRole("button", { name: "投稿", exact: true }).first().click();

  const rootPost = page
    .locator("article")
    .filter({ hasText: "スレッドの架空ルート投稿" });
  await expect(rootPost).toBeVisible();
  await rootPost
    .getByRole("button", { name: "スレッドの架空ルート投稿", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "スレッド" })).toBeVisible();
  await expect(page.getByText("1件", { exact: true })).toBeVisible();
  await expect(page.getByText("表示中の投稿", { exact: true })).toBeVisible();
  await expect(page.getByText("この先の投稿", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "続きをつなげる" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "続きをつなげる" }).click();
  const replyComposer = page.locator('[data-ds="reply-composer"]');
  await expect(replyComposer).toBeVisible();
  await expect(
    replyComposer.getByRole("switch", { name: "Xにも投稿" }),
  ).toBeChecked();
  const replyImage = replyComposer.locator(
    '.image-upload-button input[type="file"]',
  );
  await expect(replyImage).toHaveCount(1);
  await replyImage.setInputFiles({
    name: "reply-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(replyComposer.getByLabel("添付画像")).toBeVisible();
  const append = page.getByPlaceholder("続きのつぶやき");
  await append.fill("スレッドの架空の続き");
  await append.press("Escape");
  const closeDialog = page.getByRole("dialog", { name: "返信を閉じる" });
  await expect(closeDialog).toBeVisible();
  await closeDialog.getByRole("button", { name: "編集を続ける" }).click();
  await expect(append).toHaveValue("スレッドの架空の続き");
  await page.getByRole("heading", { name: "スレッド" }).click();
  await expect(closeDialog).toBeVisible();
  await closeDialog.getByRole("button", { name: "編集を続ける" }).click();
  await expect(append).toHaveValue("スレッドの架空の続き");
  await page.getByRole("button", { name: "つなげる" }).click();

  await expect(page).toHaveURL(/\?post=/);
  await expect(
    page.locator('[data-ds="detail-page"] [data-ds="tweet-body"]'),
  ).toHaveText("スレッドの架空の続き");
  await expect(
    page.getByText("スレッドの架空ルート投稿", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2件", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByText("スレッドの架空ルート投稿", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.request.post("/api/auth/logout", {
    headers: { origin: "http://localhost:3000" },
    data: {},
  });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "続きをつなげる" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("スレッドの架空ルート投稿", { exact: true }),
  ).toBeVisible();

  // The child card must not touch the divider or the preceding post's actions.
  await page.goto("/timeline");
  const childPost = page
    .locator('[data-ds="thread-post"]')
    .filter({ hasText: "スレッドの架空の続き" });
  await expect(childPost).toBeVisible();
  expect(
    await childPost.evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingTop),
    ),
  ).toBeGreaterThanOrEqual(28);
  await expectDividerAligned(childPost);
  await page.setViewportSize({ width: 1280, height: 900 });
  expect(
    await childPost.evaluate((element) =>
      parseFloat(getComputedStyle(element).paddingTop),
    ),
  ).toBeGreaterThanOrEqual(32);
  await expectDividerAligned(childPost);
});
