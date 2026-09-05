import { test, expect } from "@playwright/test";
test("anonymous UI and passkey owner journey on desktop and mobile", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "ホーム", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".desktop-composer")).toHaveCount(0);
  await expect(page.locator(".mobile-create")).toHaveCount(0);
  await expect(page.locator(".side-search")).toBeVisible();
  await expect(page.locator(".public-sidebar nav svg").first()).toBeVisible();
  await expect(page.locator(".preview-shell")).toHaveCount(0);
  expect((await page.request.get("/api/drafts")).status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-search")).toBeVisible();
  await expect(page.locator(".right-sidebar")).toBeHidden();
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
  await expect(page.locator(".mobile-create")).toBeVisible();
  await page.locator(".mobile-create").click();
  await page
    .getByPlaceholder("本文", { exact: true })
    .fill("保存される架空の下書き");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "この投稿を保存しますか？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "編集を続ける" }).click();
  await expect(page.getByPlaceholder("本文", { exact: true })).toHaveValue(
    "保存される架空の下書き",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "下書き保存", exact: true }).click();
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".desktop-composer")).toBeVisible();
  await page.getByRole("button", { name: "下書き 1" }).click();
  await page.getByRole("button", { name: /保存される架空の下書き/ }).click();
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await expect(page.locator(".tweet-body")).toHaveText(
    "保存される架空の下書き",
  );
  await page.reload();
  await expect(page.locator(".tweet-body")).toHaveText(
    "保存される架空の下書き",
  );
  await page
    .locator(".composer-kinds")
    .getByRole("button", { name: "ブログ", exact: true })
    .click();
  await page.getByPlaceholder("タイトル", { exact: true }).fill("架空のブログ");
  await page
    .getByPlaceholder("本文", { exact: true })
    .fill("## 見出し\n\n**太字**\n\n<script>alert(1)</script>");
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await page
    .getByRole("heading", { name: "架空のブログ", exact: true })
    .click();
  await expect(page.locator(".markdown strong")).toHaveText("太字");
  await expect(page.locator(".markdown script")).toHaveCount(0);
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  await expect(page.locator(".desktop-composer")).toHaveCount(0);
  await page.locator(".admin-access summary").click();
  await page
    .locator(".admin-access")
    .getByRole("button", { name: "ログイン", exact: true })
    .click();
  await expect(page.locator(".desktop-composer")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".mobile-create").click();
  await expect(
    page.getByRole("tab", { name: "ブログ", exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "vlog", exact: true }).last().click();
  await page.getByRole("tab", { name: "動画を選ぶ", exact: true }).click();
  await expect(page.locator(".vlog-stage")).toBeVisible();
  await page
    .locator('.vlog-stage input[type="file"]')
    .setInputFiles("public/flower.mp4");
  await page
    .getByPlaceholder("一文だけ（任意）")
    .fill("架空のvlogキャプション");
  await page.getByRole("button", { name: "投稿する", exact: true }).click();
  await expect(page.locator(".vlog-frame video").first()).toBeVisible();
  await expect(page.locator(".vlog-overlay p").first()).toHaveText(
    "架空のvlogキャプション",
  );
  expect(errors).toEqual([]);
});
