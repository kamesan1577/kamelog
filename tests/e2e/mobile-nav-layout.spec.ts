import { expect, test } from "@playwright/test";

test("mobile bottom navigation is split into three equal tap areas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const nav = page.locator(".mobile-nav");
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
    expect(Math.abs(box.x - (navBox.x + expectedWidth * index))).toBeLessThanOrEqual(
      1,
    );
  }
});
