import { expect, test } from "@playwright/test";

test("timeline navigation refreshes without losing the selected tab or adding history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/timeline");
  const toolbar = page.locator('[data-ds="timeline-toolbar"]');
  await toolbar.getByRole("tab", { name: "ブログ" }).click();
  const historyLength = await page.evaluate(() => window.history.length);
  let postRequests = 0;
  await page.route("**/api/posts", async (route) => {
    postRequests += 1;
    await route.continue();
  });
  await page
    .locator('[data-ds="public-sidebar"]')
    .getByRole("button", { name: "タイムライン" })
    .click();
  await expect.poll(() => postRequests).toBe(1);
  await expect(toolbar.getByRole("tab", { name: "ブログ" })).toHaveAttribute(
    "data-state",
    "active",
  );
  expect(await page.evaluate(() => window.history.length)).toBe(historyLength);
  await expect(page).toHaveURL(/\/timeline$/);
});

test.describe("mobile gesture fallback and tab selection", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("swiping the feed changes just the local category, while the refresh button remains", async ({
    page,
  }) => {
    await page.goto("/timeline");
    const toolbar = page.locator('[data-ds="timeline-toolbar"]');
    await expect(
      toolbar.getByRole("button", { name: "タイムラインを更新" }),
    ).toBeVisible();
    await page.locator(".feed").evaluate((element) => {
      const start = new Touch({
        identifier: 1,
        target: element,
        clientX: 300,
        clientY: 360,
      });
      const end = new Touch({
        identifier: 1,
        target: element,
        clientX: 175,
        clientY: 362,
      });
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [start],
          targetTouches: [start],
          changedTouches: [start],
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [end],
        }),
      );
    });
    await expect(toolbar.getByRole("tab", { name: "ブログ" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page).toHaveURL(/\/timeline$/);
  });

  test("pulling at the top refreshes without a document navigation", async ({
    page,
  }) => {
    await page.goto("/timeline");
    let requests = 0;
    await page.route("**/api/posts", async (route) => {
      requests += 1;
      await route.continue();
    });
    const documentIdentity = await page.evaluate(() => {
      (window as Window & { __timelineIdentity?: number }).__timelineIdentity =
        238;
      return window.history.length;
    });
    await page.locator(".feed").evaluate((element) => {
      const start = new Touch({
        identifier: 1,
        target: element,
        clientX: 180,
        clientY: 300,
      });
      const move = new Touch({
        identifier: 1,
        target: element,
        clientX: 181,
        clientY: 430,
      });
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [start],
          targetTouches: [start],
          changedTouches: [start],
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          touches: [move],
          targetTouches: [move],
          changedTouches: [move],
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [move],
        }),
      );
    });
    await expect.poll(() => requests).toBe(1);
    expect(await page.evaluate(() => window.history.length)).toBe(
      documentIdentity,
    );
    expect(
      await page.evaluate(
        () =>
          (window as Window & { __timelineIdentity?: number })
            .__timelineIdentity,
      ),
    ).toBe(238);
  });
});
