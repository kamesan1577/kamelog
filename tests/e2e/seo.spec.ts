import { expect, test } from "@playwright/test";

test("public SEO endpoints expose one production canonical and structured data", async ({
  page,
}) => {
  await page.goto("/");

  const title = "kamelog | かめさんのテックブログ";
  const description =
    "作ったもの、考えたこと、たまに日常。Webエンジニア・かめさんのブログとつぶやき、動画をまとめています。";
  await expect(page).toHaveTitle(title);
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]) {
    await expect(page.locator(selector)).toHaveAttribute("content", description);
  }
  for (const selector of [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) {
    await expect(page.locator(selector)).toHaveAttribute("content", title);
  }

  const rootUrl = /^https:\/\/kamesan\.org\/?$/;
  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute("href", rootUrl);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    rootUrl,
  );
  await expect(page.locator('meta[name="twitter:url"]')).toHaveAttribute(
    "content",
    rootUrl,
  );

  const structured = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((elements) =>
      elements.map((element) => JSON.parse(element.textContent || "{}")),
    );
  const website = structured.find((value) => value["@type"] === "WebSite");
  expect(website?.description).toBe(description);
  expect(structured.some((value) => value["@type"] === "Person")).toBe(true);

  const robots = await page.request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("User-Agent: *");
  expect(robotsText).toContain("Disallow: /api/");
  expect(robotsText).toContain("Disallow: /setup");
  expect(robotsText).toContain("Sitemap: https://kamesan.org/sitemap.xml");
  expect(robotsText).not.toContain("localhost");

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("<loc>https://kamesan.org/</loc>");
  expect(sitemapText).not.toContain("localhost");

  const missing = await page.request.get("/?post=missing-seo-fixture");
  expect(missing.status()).toBe(404);
});
