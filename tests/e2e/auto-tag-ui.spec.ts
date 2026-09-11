import { test, expect } from "@playwright/test";

test(
  "automatic tags are explicitly identified on desktop and mobile",
  async ({ page, context }) => {
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

    const response = await page.request.post("/api/posts", {
      data: {
        kind: "tweet",
        title: "",
        body: "自動タグ表示を確認する架空の投稿",
        tags: ["手動タグ", "自動タグ候補"],
        pinned: false,
        images: [],
      },
    });
    expect(response.ok()).toBe(true);
    const post = await response.json();
    const taggedPost = {
      ...post,
      tags: ["手動タグ", "自動タグ候補"],
      autoTags: [
        {
          tag: "自動タグ候補",
          confidence: 0.91,
          modelVersion: "e2e-fixture",
          contentHash: "fictional-content-hash",
        },
      ],
    };

    let serveTaggedPost = false;
    await page.route("**/api/posts", async (route) => {
      if (route.request().method() === "GET" && serveTaggedPost) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([taggedPost]),
        });
        return;
      }
      await route.continue();
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "タイムライン", exact: true })
      .first()
      .click();

    const postArticle = page
      .locator("article.post")
      .filter({ hasText: "自動タグ表示を確認する架空の投稿" });
    serveTaggedPost = true;
    await postArticle.locator(".more").click();
    await page.getByRole("menuitem", { name: "固定", exact: true }).click();

    const autoTag = page.getByLabel("自動タグ 自動タグ候補");
    await expect(autoTag).toBeVisible();
    await expect(autoTag).toHaveText("AI · 自動タグ候補");
    await expect(autoTag).toHaveAttribute("title", "自動で付与されたタグ");
    await expect(postArticle.getByText("手動タグ", { exact: true })).toBeVisible();

    await postArticle
      .getByRole("button", { name: /AI · 自動タグ候補/ })
      .click();
    await expect(page.locator(".filter-active")).toContainText("#自動タグ候補");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(autoTag).toBeVisible();
    await expect(autoTag).toHaveText("AI · 自動タグ候補");

    await page.locator(".filter-active button").click();
    await postArticle.locator(".post-focus").click();
    await expect(
      page.locator(".detail-page").getByLabel("自動タグ 自動タグ候補"),
    ).toBeVisible();
    await expect(
      page.locator(".detail-page").getByText("手動タグ", { exact: true }),
    ).toBeVisible();
  },
);
