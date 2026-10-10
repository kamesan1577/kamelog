import { expect, test, type Page } from "@playwright/test";

const widths = [320, 390, 640, 768, 1024, 1173, 1280, 1440];

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
}

for (const width of widths) {
  test(`publication navigation and search remain reachable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/timeline");
    await expect(
      page.getByRole("heading", { name: "タイムライン", exact: true }),
    ).toBeVisible();
    const inlineSearch = page.locator('[data-ds="mobile-search"]');
    const sideSearch = page.locator('[data-ds="side-search"]');
    const search = width < 1240 ? inlineSearch : sideSearch;
    await expect(search).toBeVisible();
    await expect(width < 1240 ? sideSearch : inlineSearch).toBeHidden();
    await search
      .getByPlaceholder("投稿を検索")
      .fill("fictional-no-match-quiet-publication-82917");
    await expect(
      page.getByText("該当する投稿はありません。", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "解除", exact: true }).click();
    await expect(search.getByPlaceholder("投稿を検索")).toHaveValue("");
    await expect(page.locator('[data-ds="inline-composer"]')).toHaveCount(0);
    await expect(page.locator('[data-ds="mobile-create"]')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page
      .getByRole("button", { name: "プロジェクト", exact: true })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "プロジェクト", exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "タイムライン", exact: true }),
    ).toBeVisible();
  });
}

test("home leads with content and retains profile links and expandable experience", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const content = page.getByRole("region", { name: "コンテンツ" });
  const experience = page.getByRole("heading", {
    name: "Experience",
    exact: true,
  });
  await expect(content).toBeVisible();
  await expect(experience).toBeVisible();
  const contentBox = await content.boundingBox();
  const experienceBox = await experience.boundingBox();
  expect(contentBox).not.toBeNull();
  expect(experienceBox).not.toBeNull();
  expect(contentBox!.y).toBeLessThan(experienceBox!.y);
  const links = page.getByRole("navigation", {
    name: "連絡先と外部プロフィール",
  });
  await expect(links).toHaveCount(1);
  await expect(
    links.getByRole("link", { name: "GitHub", exact: true }),
  ).toBeVisible();
  const socialRow = page.locator(
    '[data-ds="landing-profile"] [data-ds="profile-social-links"]',
  );
  await expect(socialRow).toHaveCount(1);
  await expect(
    socialRow.locator('[data-ds="profile-social-link-github"]'),
  ).toBeVisible();
  const details = page.locator("details.engineering-details");
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
  await expect(details.locator(".engineering-outcomes")).toBeVisible();
  await details.locator("summary").click();
  await expect(details.locator(".engineering-outcomes")).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const scrollSurface = page.locator('[data-ds="site-layout"]');
  for (const [section, name] of [
    ["#experience-title", "experience"],
    ["#contact-title", "contact"],
  ] as const) {
    await page.locator(section).evaluate((target) => {
      const surface = document.querySelector<HTMLElement>(
        '[data-ds="site-layout"]',
      );
      if (!surface) throw new Error("Mobile scroll surface is missing");
      surface.scrollTo({
        top:
          surface.scrollTop +
          target.getBoundingClientRect().top -
          surface.getBoundingClientRect().top -
          16,
        behavior: "instant",
      });
    });
    await expect(page.locator(section)).toBeInViewport();
    await expect
      .poll(() => scrollSurface.evaluate((surface) => surface.scrollTop))
      .toBeGreaterThan(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({
      animations: "disabled",
      path: `ui-evidence/quiet-publication-home-${name}-390.png`,
      fullPage: false,
    });
  }
});

const fixturePosts = Array.from({ length: 8 }, (_, index) => {
  const kind = index === 0 ? "blog" : index === 1 ? "vlog" : "tweet";
  return {
    revision: 1,
    id: `fictional-publication-${index + 1}`,
    kind,
    title: kind === "blog" ? "架空の技術記事" : "",
    body:
      kind === "blog"
        ? "## 確認用の見出し\n\n公開画面の表示を確認する架空の記事です。"
        : `表示確認用の架空の投稿 ${index + 1}`,
    date: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00.000Z`,
    tags: [`架空タグ${index + 1}`],
    autoTags: [],
    likes: 0,
    views: 0,
    images: [],
    ...(kind === "vlog" ? { video: "/flower.mp4", time: "12:00" } : {}),
  };
});

for (const width of [390, 1440]) {
  test(`publication filters retain all tags and kinds at ${width}px`, async ({
    page,
  }) => {
    await page.route("**/api/posts", (route) =>
      route.fulfill({ json: fixturePosts }),
    );
    await page.route("**/api/federation/reposts", (route) =>
      route.fulfill({ json: [] }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/timeline");
    await page
      .getByRole("button", { name: "タイムラインを更新", exact: true })
      .click();
    await expect(page.locator('[data-ds="feed-count"]')).toHaveText("8件");
    const tagScope =
      width < 1240
        ? page.locator('[data-ds="inline-topics"]')
        : page.locator('[data-ds="right-sidebar"]');
    if (width < 1240) {
      await expect(tagScope).toBeVisible();
      await tagScope.locator("summary").click();
    }
    const tagButtons = tagScope.locator('[data-ds="topic-list"] button');
    await expect(tagButtons).toHaveCount(5);
    await tagScope.locator('[data-ds="tag-load-more"]').click();
    await expect(tagButtons).toHaveCount(8);
    await tagButtons.last().click();
    await expect(page.locator('[data-ds="feed-count"]')).toHaveText("1件");
    await page.locator('[data-ds="filter-active"] button').click();
    await expect(page.locator('[data-ds="feed-count"]')).toHaveText("8件");
    const tabs = page.locator('[data-ds="timeline-tabs"]');
    for (const [kind, label, count] of [
      ["all", "すべて", 8],
      ["blog", "ブログ", 1],
      ["tweet", "つぶやき", 6],
      ["vlog", "vlog", 1],
    ] as const) {
      await tabs.getByRole("tab", { name: label, exact: true }).click();
      await expect(page.locator('[data-ds="feed-count"]')).toHaveText(
        `${count}件`,
      );
      await expectNoHorizontalOverflow(page);
      if (kind === "vlog") {
        const video = page.locator('[data-ds="vlog-frame"] video');
        const caption = page.locator('[data-ds="vlog-caption"]');
        await expect(video).toHaveCount(1);
        await expect(caption).toHaveText("表示確認用の架空の投稿 2");
        await expect
          .poll(
            async () => {
              const videoBox = await video.boundingBox();
              const captionBox = await caption.boundingBox();
              return (
                !!videoBox &&
                !!captionBox &&
                videoBox.width > 0 &&
                videoBox.height > 0 &&
                Math.abs(videoBox.height - (videoBox.width * 9) / 16) <= 1 &&
                captionBox.y >= videoBox.y + videoBox.height
              );
            },
            {
              message:
                "Vlog video must be 16:9 with its caption below the video controls",
            },
          )
          .toBe(true);
      }
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({
        animations: "disabled",
        path: `ui-evidence/quiet-publication-${kind}-${width}.png`,
        fullPage: true,
      });
    }
  });
}
