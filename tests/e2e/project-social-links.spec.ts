import { expect, test } from "@playwright/test";

test("project cards stay inside narrow viewports without cropping thumbnails", async ({
  page,
}) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: "プロジェクト" })
      .click();

    const projects = page.locator(".projects-page");
    await expect(projects).toBeVisible();
    const cards = projects.locator(".project-tile");
    await expect(cards).toHaveCount(2);

    for (let index = 0; index < 2; index += 1) {
      const box = await cards.nth(index).boundingBox();
      expect(box).not.toBeNull();
      if (!box) throw new Error("project card geometry unavailable");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      await expect(cards.nth(index).locator("img")).toHaveCSS(
        "object-fit",
        "contain",
      );
    }

    const qiitaImage = projects.locator(
      'a.project-tile[href="https://qiita.com/kamesan1577"] img',
    );
    await expect(qiitaImage).toHaveAttribute("src", "/qiita-project.svg");
    await expect(qiitaImage).toHaveAttribute("alt", "Qiita");

    if (width === 320) {
      const cardBox = await cards.first().boundingBox();
      const imageBox = await cards.first().locator("img").boundingBox();
      expect(cardBox).not.toBeNull();
      expect(imageBox).not.toBeNull();
      if (!cardBox || !imageBox)
        throw new Error("project image geometry unavailable");
      expect(imageBox.width).toBeGreaterThan(cardBox.width - 4);
    }
  }
});

test("profile exposes GitHub, X and Qiita as brand-icon links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page
    .locator(".public-sidebar nav")
    .getByRole("button", { name: "タイムライン" })
    .click();

  const profile = page.locator(".profile-card");
  await expect(profile).toBeVisible();
  const row = profile.locator("[data-kamelog-profile-social-links]");
  await expect(row).toBeVisible();
  const links = row.locator("a");
  await expect(links).toHaveCount(3);

  const github = row.getByRole("link", { name: "GitHub (@kamesan1577)" });
  const x = row.getByRole("link", { name: "X (@kamesaniniad)" });
  const qiita = row.getByRole("link", { name: "Qiita (@kamesan1577)" });

  await expect(github).toHaveAttribute(
    "href",
    "https://github.com/kamesan1577",
  );
  await expect(x).toHaveAttribute("href", "https://x.com/kamesaniniad");
  await expect(qiita).toHaveAttribute("href", "https://qiita.com/kamesan1577");
  await expect(github).toHaveText("");
  await expect(x).toHaveText("");
  await expect(qiita).toHaveText("");

  await expect(github.locator("img")).toHaveAttribute(
    "src",
    "/github-mark.svg",
  );
  await expect(x.locator("img")).toHaveAttribute("src", "/x-logo.svg");
  await expect(qiita.locator("img")).toHaveAttribute("src", "/qiita-icon.svg");
  await expect(qiita).toHaveCSS("background-color", "rgb(61, 64, 64)");
});

test("landing profile exposes social links on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const profile = page.locator(".landing-profile");
  await expect(profile).toBeVisible();
  const row = profile.locator("[data-kamelog-profile-social-links]");
  await expect(row).toBeVisible();
  await expect(row.locator("a")).toHaveCount(3);
  await expect(
    row.getByRole("link", { name: "GitHub (@kamesan1577)" }),
  ).toHaveAttribute("href", "https://github.com/kamesan1577");
  await expect(
    row.getByRole("link", { name: "X (@kamesaniniad)" }),
  ).toHaveAttribute("href", "https://x.com/kamesaniniad");
  await expect(
    row.getByRole("link", { name: "Qiita (@kamesan1577)" }),
  ).toHaveAttribute("href", "https://qiita.com/kamesan1577");
});
