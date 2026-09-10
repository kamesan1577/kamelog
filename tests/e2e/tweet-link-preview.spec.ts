import { test, expect } from "@playwright/test";

test("tweet URLs become working links and render a compact OGP card without overflowing", async ({
  page,
  context,
}) => {
  await page.route("**/api/link-preview?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        url: "https://example.test/articles/very-long-path",
        title: "架空のOGPタイトル",
        description: "架空の説明文です。",
        image: null,
        siteName: "Example Test",
      }),
    });
  });
  await context.route("https://example.test/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "ok",
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const url =
    "https://example.test/articles/%E3%81%A8%E3%81%A6%E3%82%82%E9%95%B7%E3%81%84%E3%83%91%E3%82%B9%E3%81%A7%E3%82%82%E6%8A%98%E3%82%8A%E8%BF%94%E3%81%99";
  await page.evaluate((href) => {
    const article = document.createElement("article");
    article.className = "post";
    article.style.width = "320px";
    const focus = document.createElement("button");
    focus.className = "post-focus";
    focus.type = "button";
    const body = document.createElement("p");
    body.className = "tweet-body";
    body.textContent = `参考 ${href}`;
    focus.append(body);
    article.append(focus);
    document.body.append(article);
  }, url);

  const link = page
    .locator(".tweet-inline-link")
    .filter({ hasText: "example.test" });
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect
    .poll(() =>
      link.evaluate((element) => {
        const parent = element.closest(".tweet-body");
        return parent ? parent.scrollWidth <= parent.clientWidth : false;
      }),
    )
    .toBe(true);

  const card = page
    .locator(".tweet-link-card")
    .filter({ hasText: "架空のOGPタイトル" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Example Test");
  await expect(card).toContainText("架空の説明文です。");

  // A navigation/remount can leave stale cards beside the same tweet. The
  // bridge must collapse them back to one card when it re-enhances the body.
  await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(".tweet-body");
    const host = body?.closest<HTMLElement>(".post-focus") ?? body;
    const existing = host?.nextElementSibling;
    if (!body || !host || !(existing instanceof HTMLElement)) return;
    for (let index = 0; index < 2; index += 1) {
      host.insertAdjacentElement(
        "afterend",
        existing.cloneNode(true) as HTMLElement,
      );
    }
    body.textContent = `${body.textContent ?? ""} `;
  });
  await expect(page.locator(".tweet-link-card")).toHaveCount(1);

  const popupPromise = context.waitForEvent("page");
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(url);
  await popup.close();
  await expect(page).toHaveURL(/\/$/);
});
