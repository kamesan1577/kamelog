import { expect, test, type Page } from "@playwright/test";

async function palette(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.hidden = true;
    document.body.append(probe);
    const resolve = (name: string) => {
      probe.style.color = `var(--ds-color-${name})`;
      return getComputedStyle(probe).color;
    };
    const result = {
      accent: resolve("accent"),
      accentForeground: resolve("accent-foreground"),
      text: resolve("text-primary"),
      danger: resolve("danger"),
      dangerFill: resolve("danger-fill"),
    };
    probe.remove();
    return result;
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`actions, selection, links and focus share the green accent in ${theme} appearance`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    const post = {
      id: `fictional-accent-blog-${theme}`,
      kind: "blog",
      title: "アクセント色を確認する架空の記事",
      body: "## 本文\n\n本文は中立色を維持します。[参考リンク](https://example.test/reference)",
      revision: 1,
      date: "2026-11-02T12:00:00.000Z",
      tags: [],
      autoTags: [],
      likes: 0,
      views: 0,
      images: [],
    };
    // Verify the owner presentation without changing the shared account or data.
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { authenticated: true } }),
    );
    await page.route("**/api/federation/status", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/federation/reposts", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.route("**/api/drafts", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/posts", (route) =>
      route.fulfill({ json: [post] }),
    );
    await page.goto("/timeline");
    await page.getByRole("button", { name: "タイムラインを更新" }).click();
    const colors = await palette(page);
    const channels = colors.accent.match(/\d+/g)?.map(Number);
    if (!channels) throw new Error("The accent did not resolve to RGB");
    expect(channels[1]).toBeGreaterThan(channels[0]);
    expect(channels[1]).toBeGreaterThan(channels[2]);
    expect(colors.accent).not.toBe(colors.text);

    await expect(
      page.locator('[data-ds="side-navigation"] [aria-current="page"]'),
    ).toHaveCSS("color", colors.accent);
    await expect(
      page.locator('[data-ds="timeline-tabs"] [data-state="active"]'),
    ).toHaveCSS("color", colors.accent);
    const search = page.locator('[data-ds="side-search"]');
    await search.getByPlaceholder("投稿を検索").focus();
    await expect(search).toHaveCSS("border-top-color", colors.accent);
    await expect(search.getByPlaceholder("投稿を検索")).toHaveCSS(
      "outline-color",
      colors.accent,
    );

    await page.getByRole("button", { name: "新規投稿", exact: true }).click();
    const editor = page.locator('[data-ds="editor-dialog"]');
    const body = editor.getByPlaceholder("本文", { exact: true });
    await body.fill("保存しない架空の入力です。");
    const publish = editor.getByRole("button", { name: "投稿", exact: true });
    await expect(publish).toHaveCSS("background-color", colors.accent);
    await expect(publish).toHaveCSS("color", colors.accentForeground);
    await expect(
      editor.locator('.editor-kinds [data-state="active"]'),
    ).toHaveCSS("background-color", colors.accent);
    await expect(body).toHaveCSS("color", colors.text);
    await body.press("Escape");
    const confirmation = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "この投稿を保存しますか？" }),
    });
    await expect(
      confirmation.getByRole("button", { name: "下書き保存", exact: true }),
    ).toHaveCSS("background-color", colors.accent);
    await confirmation.getByRole("button", { name: "削除して閉じる" }).click();
    await expect(editor).toHaveCount(0);

    await page.locator(`[data-reader-opener="${post.id}"]`).click();
    const reader = page.locator('[data-ds="post-reader"]');
    const markdown = reader.locator('[data-ds="detail-markdown"]');
    await expect(markdown.getByRole("link", { name: "参考リンク" })).toHaveCSS(
      "color",
      colors.accent,
    );
    await expect(markdown.locator("p").last()).toHaveCSS("color", colors.text);
    await reader.getByRole("button", { name: "その他", exact: true }).click();
    const remove = page.getByRole("menuitem", { name: "削除", exact: true });
    await expect(remove).toHaveCSS("color", colors.danger);
    await remove.click();
    const deleteDialog = page.locator('[data-ds="delete-dialog"]');
    await expect(
      deleteDialog.getByRole("button", { name: "削除", exact: true }),
    ).toHaveCSS("background-color", colors.dangerFill);
    await deleteDialog.getByRole("button", { name: "キャンセル" }).click();
    await reader.getByRole("button", { name: "投稿を閉じる" }).click();

    await page.goto("/missing-accent-fixture");
    await expect(page.getByRole("link", { name: "ホームへ戻る" })).toHaveCSS(
      "background-color",
      colors.accent,
    );
  });
}
