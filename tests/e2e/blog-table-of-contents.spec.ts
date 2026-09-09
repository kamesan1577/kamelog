import { expect, test, type Page } from "@playwright/test";

async function addBlogDetailFixture(page: Page) {
  await page.evaluate(() => {
    document.getElementById("toc-fixture")?.remove();
    const fixture = document.createElement("section");
    fixture.id = "toc-fixture";
    fixture.className = "detail-page";
    fixture.innerHTML = `
      <div class="markdown">
        <h1>記事タイトル</h1>
        <p>本文</p>
        <h2>導入</h2>
        <p>導入本文</p>
        <h3>詳細</h3>
        <p>詳細本文</p>
        <h2>導入</h2>
      </div>
    `;
    const main = document.querySelector("main.main-content") || document.body;
    main.append(fixture);
  });
}

async function expectGeneratedToc(page: Page) {
  const toc = page.getByRole("navigation", { name: "目次" });
  await expect(toc).toBeVisible();
  await expect(toc.getByRole("link")).toHaveCount(3);
  await expect(toc.getByRole("link", { name: "導入" }).first()).toHaveAttribute(
    "href",
    "#kamelog-toc-導入",
  );
  await expect(toc.getByRole("link", { name: "詳細" })).toHaveAttribute(
    "href",
    "#kamelog-toc-詳細",
  );
  await expect(toc.getByRole("link", { name: "導入" }).last()).toHaveAttribute(
    "href",
    "#kamelog-toc-導入-2",
  );
  await expect(page.locator("#toc-fixture h1")).not.toHaveAttribute("id", /.+/);
  await expect(page.locator("#toc-fixture h2").first()).toHaveAttribute(
    "id",
    "kamelog-toc-導入",
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const fixture = document.getElementById("toc-fixture");
        const toc = fixture?.querySelector("[data-kamelog-blog-toc]");
        const markdown = fixture?.querySelector(".markdown");
        return toc?.nextElementSibling === markdown;
      }),
    )
    .toBe(true);
}

test("blog detail generates a table of contents from h2-h6 headings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await addBlogDetailFixture(page);
  await expectGeneratedToc(page);

  await page.evaluate(() => document.getElementById("toc-fixture")?.remove());
  await expect(page.getByRole("navigation", { name: "目次" })).toHaveCount(0);
});

test("blog table of contents returns before the article after a desktop rerender", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await addBlogDetailFixture(page);
  await expectGeneratedToc(page);

  await page.evaluate(() => {
    const fixture = document.getElementById("toc-fixture");
    const toc = fixture?.querySelector("[data-kamelog-blog-toc]");
    const markdown = fixture?.querySelector(".markdown");
    if (!fixture || !toc || !markdown) throw new Error("TOC fixture is missing");

    fixture.insertBefore(markdown, toc);
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const fixture = document.getElementById("toc-fixture");
        const toc = fixture?.querySelector("[data-kamelog-blog-toc]");
        const markdown = fixture?.querySelector(".markdown");
        return toc?.nextElementSibling === markdown;
      }),
    )
    .toBe(true);
});

test("blog table of contents stays inside a 390px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await addBlogDetailFixture(page);
  await expectGeneratedToc(page);

  const box = await page
    .getByRole("navigation", { name: "目次" })
    .boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
});
