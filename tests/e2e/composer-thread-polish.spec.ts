import { access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { Store } from "../../server/store.mjs";

async function activeE2EDataDirectory() {
  const directories = await Promise.all(
    (await readdir(tmpdir(), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("kamelog-e2e-"))
      .map(async (entry) => {
        const path = join(tmpdir(), entry.name);
        return { path, mtimeMs: (await stat(path)).mtimeMs };
      }),
  );
  directories.sort((a, b) => b.mtimeMs - a.mtimeMs);
  for (const directory of directories) {
    try {
      await access(join(directory.path, "kamelog.sqlite"));
      return directory.path;
    } catch {
      // Ignore a stale E2E directory.
    }
  }
  throw new Error("active kamelog E2E data directory not found");
}

async function expectDividerAligned(page: Page, text: string) {
  const reply = page.locator('[data-ds="thread-post"]').filter({ hasText: text });
  await expect(reply).toBeVisible();
  const divider = await reply.evaluate((element) => {
    const style = getComputedStyle(element, "::after");
    const box = element.getBoundingClientRect();
    const feed = element.closest(".feed")?.getBoundingClientRect();
    return {
      left: box.left + parseFloat(style.left),
      rootLeft: feed?.left,
      thickness: style.height,
      color: style.backgroundColor,
    };
  });
  expect(divider.rootLeft).toBeDefined();
  expect(Math.abs(divider.left - divider.rootLeft!)).toBeLessThanOrEqual(1);
  expect(divider.thickness).toBe("1px");
  expect(divider.color).not.toBe("rgba(0, 0, 0, 0)");
}

test("image picker is icon-only and reply dividers reach the timeline edge", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const store = new Store(await activeE2EDataDirectory());
  const session = store.createSession();
  store.close();
  await context.addCookies([
    { name: "kamelog-session", value: session, url: "http://localhost:3000" },
  ]);

  await page.goto("/timeline");
  const imagePicker = page.locator(".desktop-composer .image-upload-button");
  await expect(imagePicker).toBeVisible();
  await expect(imagePicker).toHaveText(/画像/);
  await expect(imagePicker).toHaveCSS("font-size", "0px");
  await expect(imagePicker.locator("svg")).toHaveAttribute("width", "24");
  await expect(imagePicker.locator('input[type="file"]')).toHaveAttribute(
    "accept",
    "image/png,image/jpeg,image/webp,image/gif",
  );
  const imageIconSize = await imagePicker.locator("svg").boundingBox();
  expect(imageIconSize?.width).toBe(20);
  expect(imageIconSize?.height).toBe(20);

  await page.getByPlaceholder("いまどうしてる？").fill("架空の区切り線ルート");
  await page.getByRole("button", { name: "投稿", exact: true }).first().click();
  const rootPost = page
    .locator("article")
    .filter({ hasText: "架空の区切り線ルート" });
  await expect(rootPost).toBeVisible();
  await rootPost
    .getByRole("button", { name: "架空の区切り線ルート", exact: true })
    .click();
  await page.getByRole("button", { name: "続きをつなげる" }).click();
  await page.getByPlaceholder("続きのつぶやき").fill("架空の区切り線リプライ");
  await page.getByRole("button", { name: "つなげる" }).click();

  await page.goto("/timeline");
  await expectDividerAligned(page, "架空の区切り線リプライ");
  await page.setViewportSize({ width: 390, height: 844 });
  await expectDividerAligned(page, "架空の区切り線リプライ");
});
