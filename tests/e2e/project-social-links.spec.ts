import { expect, test } from "@playwright/test";

const githubMarkUrl =
  "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";
const xLogoUrl =
  "https://about.x.com/content/dam/about-twitter/x/brand-toolkit/logo-black.png.twimg.1920.png";
const qiitaLogoUrl =
  "https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Qiita_Logo.svg/330px-Qiita_Logo.svg.png";

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
      const card = cards.nth(index);
      const box = await card.boundingBox();
      const imageBox = await card.locator("img").boundingBox();
      expect(box).not.toBeNull();
      expect(imageBox).not.toBeNull();
      if (!box || !imageBox)
        throw new Error("project card geometry unavailable");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
      expect(imageBox.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(
        box.x + box.width + 0.5,
      );
      await expect(card.locator("img")).toHaveCSS("object-fit", "contain");
    }

    const qiitaImage = projects.locator(
      'a.project-tile[href="https://qiita.com/kamesan1577"] img',
    );
    await expect(qiitaImage).toHaveAttribute("src", qiitaLogoUrl);
    await expect(qiitaImage).toHaveAttribute("alt", "Qiita");
  }
});

test("profile exposes GitHub, X and Qiita as brand-image links", async ({
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

  await expect(github.locator("img")).toHaveAttribute("src", githubMarkUrl);
  await expect(x.locator("img")).toHaveAttribute("src", xLogoUrl);
  await expect(qiita.locator("img")).toHaveAttribute("src", qiitaLogoUrl);
  for (const link of [github, x, qiita]) {
    await expect(link).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(link).toHaveCSS("border-top-width", "0px");
  }
});
