import { access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
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
      value: session,
      url: "http://localhost:3000",
    },
  ]);

  await page.goto("/");
  await page
    .getByRole("button", { name: "タイムライン", exact: true })
    .first()
    .click();
  const inline = page.getByPlaceholder("いまどうしてる？");
  await inline.fill("スレッドの架空ルート投稿");
  await page
    .locator(".desktop-composer")
    .getByRole("button", { name: "投稿", exact: true })
    .click();

  const rootPost = page
    .locator("article.post")
    .filter({ hasText: "スレッドの架空ルート投稿" });
  await expect(rootPost).toBeVisible();
  await rootPost.locator(".post-focus").click();
  await expect(page.getByRole("heading", { name: "スレッド" })).toBeVisible();
  await expect(page.getByText("1件", { exact: true })).toBeVisible();
  await expect(page.getByText("表示中の投稿", { exact: true })).toBeVisible();
  await expect(page.getByText("この先の投稿", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "続きをつなげる" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "続きをつなげる" }).click();
  const append = page.getByPlaceholder("続きのつぶやき");
  await append.fill("スレッドの架空の続き");
  await page.getByRole("button", { name: "つなげる" }).click();

  await expect(page).toHaveURL(/\?post=/);
  await expect(page.locator(".detail-page > .tweet-body")).toHaveText(
    "スレッドの架空の続き",
  );
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
});
