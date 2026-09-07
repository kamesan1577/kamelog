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
  await expect(
    page.getByRole("dialog").filter({ hasText: "この投稿を保存しますか？" }),
  ).toHaveCount(0);
  await expect(page.getByPlaceholder("本文", { exact: true })).toHaveValue(
    "保存される架空の下書き",
  );
  await page.keyboard.press("Escape");
  const saveDraft = page.getByRole("button", {
    name: "下書き保存",
    exact: true,
  });
  await expect(saveDraft).toBeVisible();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/drafts") &&
      response.request().method() === "POST",
  );
  await saveDraft.click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".desktop-composer")).toBeVisible();
  await page.keyboard.press("n");
  const modalBody = page.getByPlaceholder("本文", { exact: true });
  await expect(modalBody).toBeFocused();
  await page.getByRole("button", { name: "下書きから貼り付け" }).click();
  await page.getByRole("button", { name: /保存される架空の下書き/ }).click();
  await expect(modalBody).toHaveValue("保存される架空の下書き");
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await expect(page.locator(".tweet-body")).toHaveText(
    "保存される架空の下書き",
  );
  await page.reload();
  await expect(page.locator(".tweet-body")).toHaveText(
    "保存される架空の下書き",
  );
  const inlineTweet = page.getByPlaceholder("いまどうしてる？");
  await inlineTweet.fill("ホームから直接投稿する架空のつぶやき");
  await inlineTweet.press("Control+Enter");
  await expect(page.locator(".tweet-body").first()).toHaveText(
    "ホームから直接投稿する架空のつぶやき",
  );
  const directPost = page
    .locator("article.post")
    .filter({ hasText: "ホームから直接投稿する架空のつぶやき" });
  await directPost.locator("button.more").click();
  await page.getByRole("menuitem", { name: "削除" }).click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(
    deleteDialog.getByRole("button", { name: "削除" }),
  ).toBeVisible();
  await deleteDialog.getByRole("button", { name: "キャンセル" }).click();
  await page
    .locator(".composer-kinds")
    .getByRole("button", { name: "ブログ", exact: true })
    .click();
  await page.getByPlaceholder("タイトル", { exact: true }).fill("架空のブログ");
  const markdownToolbar = page.getByRole("toolbar", {
    name: "Markdown記法",
  });
  for (const name of [
    "見出し",
    "太字",
    "斜体",
    "取り消し線",
    "引用",
    "箇条書き",
    "番号付きリスト",
    "チェックリスト",
    "リンク",
    "画像",
    "インラインコード",
    "コードブロック",
    "表",
    "区切り線",
  ]) {
    await expect(markdownToolbar.getByRole("button", { name })).toBeVisible();
  }
  await markdownToolbar.getByRole("button", { name: "Markdownヘルプ" }).click();
  await expect(
    page.getByRole("heading", { name: "Markdown記法ヘルプ" }),
  ).toBeVisible();
  await expect(page.getByText("- [ ] 未完了")).toBeVisible();
  await expect(page.getByText("```javascript")).toBeVisible();
  await page.keyboard.press("Escape");
  const blogBody = page.getByPlaceholder("本文", { exact: true });
  await markdownToolbar.getByRole("button", { name: "箇条書き" }).click();
  await expect(blogBody).toHaveValue("- 項目");
  await blogBody.fill(
    "## 見出し\n\n**太字**\n\n- 箇条書き\n- [ ] 未完了\n- [x] 完了\n\n```javascript\nconst answer = 42;\n```\n\n<script>alert(1)</script>",
  );
  await page.getByRole("button", { name: "投稿", exact: true }).click();
  await page
    .getByRole("heading", { name: "架空のブログ", exact: true })
    .click();
  await expect(page.locator(".markdown strong")).toHaveText("太字");
  await expect(page.locator(".markdown ul > li").first()).toHaveText(
    "箇条書き",
  );
  expect(
    await page
      .locator(".markdown ul")
      .first()
      .evaluate((element) => getComputedStyle(element).listStyleType),
  ).not.toBe("none");
  await expect(page.locator('.markdown input[type="checkbox"]')).toHaveCount(2);
  await expect(page.locator(".markdown pre code.hljs")).toContainText(
    "const answer = 42;",
  );
  await expect(page.locator(".markdown .hljs-keyword")).toHaveText("const");
  await expect(page.locator(".markdown script")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "リンクをコピー" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Xで共有" })).toBeVisible();
  const posts = await (await page.request.get("/api/posts")).json();
  const blog = posts.find(
    (post: { title: string }) => post.title === "架空のブログ",
  );
  const shared = await page.request.get("/?post=" + blog.id);
  expect(await shared.text()).toContain('property="og:image"');
  const og = await page.request.get("/og?post=" + blog.id);
  expect(og.ok()).toBe(true);
  expect(og.headers()["content-type"]).toContain("image/png");
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
  const mobileBlogTab = page
    .getByRole("tab", { name: "ブログ", exact: true })
    .last();
  await expect(mobileBlogTab).toBeVisible();
  await mobileBlogTab.click();
  await expect(page.getByPlaceholder("タイトル", { exact: true })).toBeVisible();
  const mobileBlogDialog = page.locator(".editor-dialog");
  const mobileMarkdownToolbar = page.getByRole("toolbar", {
    name: "Markdown記法",
  });
  await expect(
    mobileMarkdownToolbar.getByRole("button", { name: "Markdownヘルプ" }),
  ).toBeVisible();
  await expect(
    mobileMarkdownToolbar.getByRole("button", { name: "プレビュー" }),
  ).toBeVisible();
  const mobileEditorGeometry = await mobileBlogDialog.evaluate((dialog) => {
    const tools = dialog.querySelector<HTMLElement>(".editor-tools");
    const help = dialog.querySelector<HTMLElement>(".markdown-help-link");
    const preview = dialog.querySelector<HTMLElement>(".preview-toggle");
    if (!tools || !help || !preview) throw new Error("blog editor controls missing");
    const dialogRect = dialog.getBoundingClientRect();
    const toolsRect = tools.getBoundingClientRect();
    const helpRect = help.getBoundingClientRect();
    const previewRect = preview.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      dialogClientWidth: dialog.clientWidth,
      dialogScrollWidth: dialog.scrollWidth,
      dialogLeft: dialogRect.left,
      dialogRight: dialogRect.right,
      toolsLeft: toolsRect.left,
      toolsRight: toolsRect.right,
      helpLeft: helpRect.left,
      helpRight: helpRect.right,
      previewLeft: previewRect.left,
      previewRight: previewRect.right,
    };
  });
  expect(mobileEditorGeometry.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(mobileEditorGeometry.dialogRight).toBeLessThanOrEqual(
    mobileEditorGeometry.viewportWidth,
  );
  expect(mobileEditorGeometry.dialogScrollWidth).toBeLessThanOrEqual(
    mobileEditorGeometry.dialogClientWidth + 1,
  );
  for (const edge of [
    mobileEditorGeometry.toolsLeft,
    mobileEditorGeometry.helpLeft,
    mobileEditorGeometry.previewLeft,
  ]) {
    expect(edge).toBeGreaterThanOrEqual(mobileEditorGeometry.dialogLeft - 1);
  }
  for (const edge of [
    mobileEditorGeometry.toolsRight,
    mobileEditorGeometry.helpRight,
    mobileEditorGeometry.previewRight,
  ]) {
    expect(edge).toBeLessThanOrEqual(mobileEditorGeometry.dialogRight + 1);
  }
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
  await expect
    .poll(() =>
      page
        .locator(".vlog-frame video")
        .first()
        .evaluate((video) => ({
          muted: (video as HTMLVideoElement).muted,
          loop: (video as HTMLVideoElement).loop,
        })),
    )
    .toEqual({ muted: true, loop: true });
  await page.getByRole("button", { name: "ループ再生を停止" }).first().click();
  await expect
    .poll(() =>
      page
        .locator(".vlog-frame video")
        .first()
        .evaluate((video) => (video as HTMLVideoElement).loop),
    )
    .toBe(false);
  expect(errors).toEqual([]);
});
