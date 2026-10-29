import { access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { Store } from "../../server/store.mjs";

async function seedPost() {
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
    } catch {
      continue;
    }
    const store = new Store(candidate.path);
    const post = store.save("posts", randomUUID(), {
      kind: "blog",
      title: "架空のいいね検証記事",
      body: "いいねを共有する架空の本文。",
      tags: [],
      date: new Date().toISOString(),
      likes: 0,
    });
    store.close();
    return post.id as string;
  }
  throw new Error("active kamelog E2E data directory not found");
}

const likeButton = (page: Page) =>
  page
    .locator('[data-ds="detail-page"] [data-ds="post-actions"] button')
    .first();

for (const width of [1280, 390]) {
  test(`local likes persist and are shared across visitors at ${width}px`, async ({
    page,
    browser,
    baseURL,
  }) => {
    const id = await seedPost();
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?post=${id}`);
    await expect(likeButton(page)).toHaveText("0");
    await likeButton(page).click();
    await expect(likeButton(page)).toHaveText("1");
    expect(
      (await (await page.request.get(`/api/posts/${id}`)).json()).likes,
    ).toBe(1);

    const visitor = await browser.newContext({
      baseURL,
      viewport: { width, height: 900 },
    });
    try {
      const other = await visitor.newPage();
      await other.goto(`/?post=${id}`);
      await expect(likeButton(other)).toHaveText("1");
      await expect(likeButton(other)).not.toHaveClass("liked");
      await likeButton(other).click();
      await expect(likeButton(other)).toHaveText("2");
      await page.reload();
      await expect(likeButton(page)).toHaveText("2");
      await expect(likeButton(page)).toHaveClass("liked");
      await likeButton(page).click();
      await expect(likeButton(page)).toHaveText("1");
      await expect(likeButton(page)).not.toHaveClass("liked");
      await page.reload();
      await expect(likeButton(page)).toHaveText("1");
      await expect(likeButton(page)).not.toHaveClass("liked");
      await other.reload();
      await expect(likeButton(other)).toHaveText("1");
      await expect(likeButton(other)).toHaveClass("liked");
    } finally {
      await visitor.close();
    }
  });
}

test("failed likes retain the confirmed state and repeated clicks share one request", async ({
  page,
}) => {
  const id = await seedPost();
  await page.goto(`/?post=${id}`);
  await page.route(`**/api/posts/${id}/like`, (route) => route.abort());
  await likeButton(page).click();
  await expect(
    page.locator('[data-sonner-toast][data-type="error"]'),
  ).toBeVisible();
  await expect(likeButton(page)).toHaveText("0");
  await expect(likeButton(page)).not.toHaveClass("liked");
  await page.unroute(`**/api/posts/${id}/like`);

  let requests = 0;
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/posts/${id}/like`, async (route) => {
    requests += 1;
    await pending;
    await route.continue();
  });
  await likeButton(page).evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect.poll(() => requests).toBe(1);
  await expect(likeButton(page)).toBeDisabled();
  await expect(likeButton(page)).toHaveText("0");
  release();
  await expect(likeButton(page)).toHaveText("1");
  expect(requests).toBe(1);
  await page.unroute(`**/api/posts/${id}/like`);
  await page.route(`**/api/posts/${id}/like`, (route) => route.abort());
  await likeButton(page).click();
  await expect(likeButton(page)).toBeEnabled();
  await expect(likeButton(page)).toHaveText("1");
  await expect(likeButton(page)).toHaveClass("liked");
});

test("legacy and malformed browser likes never inflate the public total", async ({
  page,
}) => {
  const id = await seedPost();
  await page.addInitScript((postId) => {
    localStorage.setItem("kamelog-likes", JSON.stringify([postId]));
    localStorage.setItem("kamelog-likes-v2", "{invalid");
  }, id);
  await page.goto(`/?post=${id}`);
  await expect(likeButton(page)).toHaveText("0");
  await expect(likeButton(page)).not.toHaveClass("liked");
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveText("1");
  expect(
    (await (await page.request.get(`/api/posts/${id}`)).json()).likes,
  ).toBe(1);
});

test("likes remain usable when browser storage is unavailable", async ({
  page,
}) => {
  const id = await seedPost();
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Unavailable", "SecurityError");
      },
    });
  });
  await page.goto(`/?post=${id}`);
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveText("1");
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveText("0");
  expect(
    (await (await page.request.get(`/api/posts/${id}`)).json()).likes,
  ).toBe(0);
});

test("a delayed view response cannot overwrite a saved like", async ({
  page,
}) => {
  const id = await seedPost();
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let viewReceived = false;
  await page.route(`**/api/posts/${id}/view`, async (route) => {
    const response = await route.fetch();
    viewReceived = true;
    await pending;
    await route.fulfill({ response });
  });
  await page.goto(`/?post=${id}`);
  await expect.poll(() => viewReceived).toBe(true);
  await likeButton(page).click();
  await expect(likeButton(page)).toHaveText("1");
  const response = page.waitForResponse(`**/api/posts/${id}/view`);
  release();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  await expect(likeButton(page)).toHaveText("1");
  await expect(likeButton(page)).toHaveClass("liked");
});
