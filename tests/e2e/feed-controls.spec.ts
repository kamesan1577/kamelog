import { expect, test, type Page } from "@playwright/test";

const posts = [
  { id: "alpha", body: "検索用の共有メモ alpha", tags: ["設計"] },
  { id: "beta", body: "検索用の共有メモ beta", tags: ["実装"] },
  { id: "gamma", body: "検索用の別メモ gamma", tags: ["設計"] },
].map((post, index) => ({
  ...post,
  id: `fictional-feed-controls-${post.id}`,
  revision: 1,
  kind: "tweet",
  title: "",
  date: `2026-09-0${index + 1}T12:00:00.000Z`,
  autoTags: [],
  likes: 0,
  views: 0,
  images: [],
}));

async function openTimeline(page: Page, width: number) {
  await page.route("**/api/posts", (route) => route.fulfill({ json: posts }));
  await page.route("**/api/federation/reposts", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/timeline");
  await page.getByRole("button", { name: "タイムラインを更新" }).click();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("3件");
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

for (const width of [320, 390]) {
  test(`compact controls leave the first post visible at ${width}px`, async ({
    page,
  }) => {
    await openTimeline(page, width);
    const toolbar = page.locator('[data-ds="timeline-toolbar"]');
    const toggle = toolbar.getByRole("button", { name: "検索とタグ" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute(
      "aria-controls",
      "timeline-search-panel",
    );
    await expect(page.locator("#timeline-search-panel")).toBeHidden();
    await expect(toolbar.getByRole("tab")).toHaveText([
      "すべて",
      "ブログ",
      "つぶやき",
      "vlog",
    ]);
    for (const name of ["検索とタグ", "タイムラインを更新", "並び替え"]) {
      await expect(
        toolbar.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    const geometry = await toolbar.evaluate((element) => {
      const controls = Array.from(
        element.querySelectorAll('[role="tab"], button[aria-label]'),
      );
      const toolbarBox = element.getBoundingClientRect();
      return {
        left: toolbarBox.left,
        right: toolbarBox.right,
        controls: controls.map((control) => {
          const box = control.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            centerY: box.y + box.height / 2,
          };
        }),
      };
    });
    expect(geometry.controls).toHaveLength(7);
    for (const control of geometry.controls) {
      expect(
        Math.abs(control.centerY - geometry.controls[0].centerY),
      ).toBeLessThanOrEqual(1);
      expect(control.left).toBeGreaterThanOrEqual(geometry.left - 1);
      expect(control.right).toBeLessThanOrEqual(geometry.right + 1);
    }
    const firstPost = page.locator('[data-ds="post-card"]').first();
    await expect(firstPost).toBeInViewport();
    const firstPostBox = await firstPost.boundingBox();
    expect(firstPostBox).not.toBeNull();
    expect(firstPostBox!.y).toBeLessThanOrEqual(240);
    await expectNoHorizontalOverflow(page);
  });
}

test("search and tag filters survive Escape and can be cleared independently", async ({
  page,
}) => {
  await openTimeline(page, 390);
  const toggle = page.getByRole("button", { name: "検索とタグ", exact: true });
  const panel = page.locator("#timeline-search-panel");
  const search = panel.getByPlaceholder("投稿を検索");
  const active = page.locator('[data-ds="filter-active"]');

  await toggle.focus();
  await toggle.press("Enter");
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(search).toBeFocused();
  await expect(
    panel.locator('[data-ds="inline-topics"] [data-ds="topic-list"]'),
  ).toBeVisible();
  await search.fill("共有");
  // Escape cancels IME composition before it can close the surrounding search.
  await search.dispatchEvent("keydown", { key: "Escape", isComposing: true });
  await expect(panel).toBeVisible();
  await expect(search).toBeFocused();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("2件");
  await panel
    .locator('[data-ds="topic-list"]')
    .getByRole("button", { name: /^#設計/ })
    .click();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("data-active", "true");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
  await expect(active).toContainText("共有");
  await expect(active).toContainText("#設計");
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");

  await toggle.press("Enter");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("共有");
  await page.keyboard.press("Escape");
  await active.getByRole("button", { name: /^検索を解除: 共有$/ }).click();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("2件");
  await expect(active).not.toContainText("共有");
  await expect(active).toContainText("#設計");
  await active.getByRole("button", { name: /^タグを解除: 設計$/ }).click();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("3件");
  await expect(active).toHaveCount(0);
  await expect(toggle).not.toHaveAttribute("data-active", "true");
  await expectNoHorizontalOverflow(page);
});

test("active filters move between the inline panel and right sidebar at 1240px", async ({
  page,
}) => {
  await openTimeline(page, 1240);
  const sideSearch = page.locator('[data-ds="side-search"]');
  const toggle = page.getByRole("button", { name: "検索とタグ", exact: true });
  const panel = page.locator("#timeline-search-panel");
  await expect(toggle).toBeHidden();
  await expect(sideSearch).toBeVisible();
  await sideSearch.getByPlaceholder("投稿を検索").fill("共有");
  await page
    .locator('[data-ds="right-sidebar"] [data-ds="topic-list"]')
    .getByRole("button", { name: /^#設計/ })
    .click();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");

  await page.setViewportSize({ width: 1239, height: 844 });
  await expect(sideSearch).toBeHidden();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();
  await expect(panel.getByPlaceholder("投稿を検索")).toHaveValue("共有");
  await expect(page.locator('[data-ds="filter-active"]')).toContainText(
    "#設計",
  );
  await panel.getByPlaceholder("投稿を検索").press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");

  await page.setViewportSize({ width: 1240, height: 844 });
  await expect(toggle).toBeHidden();
  await expect(panel).toBeHidden();
  await expect(sideSearch.getByPlaceholder("投稿を検索")).toHaveValue("共有");
  await expect(sideSearch).toBeVisible();
  await page.setViewportSize({ width: 1239, height: 844 });
  await expect(panel).toBeVisible();
  await expect(panel.getByPlaceholder("投稿を検索")).toHaveValue("共有");
  await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");
  await expectNoHorizontalOverflow(page);
});

for (const width of [320, 390, 641, 1240, 1440]) {
  test(`long ASCII tags stay inside the filters and feed at ${width}px`, async ({
    page,
  }) => {
    const longTag = "W".repeat(40);
    await page.route("**/api/posts", (route) =>
      route.fulfill({ json: [{ ...posts[0], tags: [longTag] }] }),
    );
    await page.route("**/api/federation/reposts", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/timeline");
    await page.getByRole("button", { name: "タイムラインを更新" }).click();
    await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");
    if (width < 1240)
      await page
        .getByRole("button", { name: "検索とタグ", exact: true })
        .click();

    const main = page.locator('[data-ds="main-content"]');
    const mainBox = await main.boundingBox();
    if (!mainBox) throw new Error("Feed geometry is unavailable");
    const topicScope =
      width < 1240
        ? page.locator("#timeline-search-panel")
        : page.locator('[data-ds="right-sidebar"]');
    const topicBox = await topicScope.boundingBox();
    if (!topicBox) throw new Error("Tag filter geometry is unavailable");
    const filterTag = topicScope.locator('[data-ds="topic-list"] button');
    const postTag = page.locator(
      '[data-ds="post-card"] [data-ds="tag-list"] button',
    );
    await expect(filterTag).toContainText(longTag);
    await expect(postTag).toHaveText(longTag);
    for (const [name, tag, container] of [
      ["filter tag", filterTag, topicBox],
      ["post tag button", postTag, mainBox],
      ["post tag label", postTag.locator('[data-slot="badge"]'), mainBox],
    ] as const) {
      await expect(tag).toBeVisible();
      const box = await tag.boundingBox();
      if (!box) throw new Error(`${name} geometry is unavailable`);
      expect
        .soft(box.x, `${name} left edge`)
        .toBeGreaterThanOrEqual(container.x);
      expect
        .soft(box.x + box.width, `${name} right edge`)
        .toBeLessThanOrEqual(container.x + container.width + 1);
    }
    if (width <= 640) {
      const overflow = await page
        .locator('[data-ds="site-layout"]')
        .evaluate((element) => element.scrollWidth - element.clientWidth);
      expect
        .soft(overflow, "Mobile content must not scroll horizontally")
        .toBeLessThanOrEqual(1);
    }
    await expectNoHorizontalOverflow(page);
  });
}
