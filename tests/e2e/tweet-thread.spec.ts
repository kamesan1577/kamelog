import { test, expect } from "@playwright/test";

test("owner can append a tweet thread and public detail renders the chain", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.goto("/setup");
  await page
    .getByLabel("登録トークン")
    .fill("fictional-e2e-bootstrap-token-not-a-secret");
  await page
    .getByRole("button", { name: "パスキーを登録", exact: true })
    .click();
  await expect(page).toHaveURL("/");

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
  await expect(page.getByRole("button", { name: "続きをつなげる" })).toBeVisible();

  await page.getByRole("button", { name: "続きをつなげる" }).click();
  const append = page.getByPlaceholder("続きのつぶやき");
  await append.fill("スレッドの架空の続き");
  await page.getByRole("button", { name: "つなげる" }).click();

  await expect(page).toHaveURL(/\?post=/);
  await expect(page.locator(".detail-page > .tweet-body")).toHaveText(
    "スレッドの架空の続き",
  );
  await expect(page.getByText("スレッドの架空ルート投稿", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("スレッドの架空ルート投稿", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "続きをつなげる" })).toHaveCount(0);
  await expect(page.getByText("スレッドの架空ルート投稿", { exact: true })).toBeVisible();
});
