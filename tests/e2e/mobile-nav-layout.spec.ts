import { expect, test } from "@playwright/test";

test("mobile bottom navigation is split into three equal tap areas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "モバイルナビゲーション" });
  await expect(nav).toBeVisible();
  const buttons = nav.locator("button");
  await expect(buttons).toHaveCount(3);

  const navBox = await nav.boundingBox();
  expect(navBox).not.toBeNull();
  if (!navBox) throw new Error("mobile nav geometry unavailable");

  const expectedWidth = navBox.width / 3;
  for (let index = 0; index < 3; index += 1) {
    const box = await buttons.nth(index).boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("mobile nav item geometry unavailable");
    expect(Math.abs(box.width - expectedWidth)).toBeLessThanOrEqual(1);
    expect(
      Math.abs(box.x - (navBox.x + expectedWidth * index)),
    ).toBeLessThanOrEqual(1);
  }
});

test("mobile bottom navigation stays anchored to the viewport while scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/timeline");

  const nav = page.getByRole("navigation", { name: "モバイルナビゲーション" });
  await expect(nav).toBeVisible();

  await page.evaluate(() => {
    const workspace = document.querySelector<HTMLElement>(
      '[data-ds="workspace"]',
    );
    const main = document.querySelector<HTMLElement>(
      '[data-ds="main-content"]',
    );
    if (!workspace || !main) throw new Error("mobile layout unavailable");

    // Stress the fixed navigation against a containing block. Mobile WebKit can
    // promote scrolling ancestors similarly while the page is in motion.
    workspace.style.transform = "translateZ(0)";
    main.style.minHeight = "1800px";
  });

  const assertAnchored = async () => {
    const box = await nav.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("mobile nav geometry unavailable");
    expect(Math.abs(box.y + box.height - 844)).toBeLessThanOrEqual(1);
  };

  await assertAnchored();
  await page.evaluate(() => window.scrollTo(0, 600));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await assertAnchored();
});
