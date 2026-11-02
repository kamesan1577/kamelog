import { expect, test } from "@playwright/test";

const quota = {
  code: "storage_limit",
  error:
    "保存サービスの利用上限に達しました。入力内容を残したまま、投稿一覧・下書きで保存結果を確認してください。未保存の場合は、容量または利用枠の回復後に再試行してください。",
};
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

for (const width of [390, 1280]) {
  test(`storage limits explain failed publishing, drafts and uploads while retaining input at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem("kamelog:x-intent:tweet", "false");
    });
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { authenticated: true } }),
    );
    await page.route("**/api/federation/status", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/inference/status", (route) =>
      route.fulfill({ json: {} }),
    );
    let postAttempts = 0;
    let draftAttempts = 0;
    let imageAttempts = 0;
    await page.route("**/api/posts", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: [] });
      postAttempts++;
      return route.fulfill({ status: 507, json: quota });
    });
    await page.route("**/api/drafts", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: [] });
      draftAttempts++;
      return route.fulfill({ status: 507, json: quota });
    });
    await page.route("**/api/media?*", (route) => {
      imageAttempts++;
      return route.fulfill({ status: 507, json: quota });
    });
    await page.goto("/timeline");
    if (width === 390) await page.locator('[data-ds="mobile-create"]').click();
    else
      await page.getByRole("button", { name: "新規投稿", exact: true }).click();
    const dialog = page.locator('[data-ds="editor-dialog"]');
    const body = dialog.getByPlaceholder("本文", { exact: true });
    const text = "保存上限でも消えてはいけない架空の投稿本文";
    await body.fill(text);
    const publish = dialog.getByRole("button", { name: "投稿", exact: true });
    await publish.click();
    await expect.poll(() => postAttempts).toBe(1);
    await expect(
      page.getByText(quota.error, { exact: true }).first(),
    ).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(body).toHaveValue(text);
    await expect(page.getByText("投稿しました", { exact: true })).toHaveCount(
      0,
    );

    await dialog.locator('input[type="file"]').setInputFiles({
      name: "fictional-quota-image.png",
      mimeType: "image/png",
      buffer: image,
    });
    await expect.poll(() => imageAttempts).toBe(1);
    await expect(
      page.getByText(quota.error, { exact: true }).first(),
    ).toBeVisible();
    await expect(body).toHaveValue(text);
    await expect(dialog.locator('[data-ds="composer-images"]')).toHaveCount(0);

    await body.focus();
    await page.keyboard.press("Escape");
    const confirmation = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "この投稿を保存しますか？" }),
    });
    await confirmation
      .getByRole("button", { name: "下書き保存", exact: true })
      .click();
    await expect.poll(() => draftAttempts).toBe(1);
    await expect(confirmation).toBeVisible();
    await expect(
      page.getByText(quota.error, { exact: true }).first(),
    ).toBeVisible();
    await confirmation.getByRole("button", { name: "編集を続ける" }).click();
    await expect(body).toHaveValue(text);
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText("下書きを保存しました", { exact: true }),
    ).toHaveCount(0);
  });
}
