import { expect, test } from "@playwright/test";

test.describe("timeline tab indicator", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("slides to the selected tab after a swipe and a tap", async ({ page }) => {
    await page.goto("/timeline");
    const toolbar = page.locator('[data-ds="timeline-toolbar"]');
    const tabs = toolbar.locator('[data-ds="timeline-tabs"]');
    await expect(tabs).toHaveAttribute("data-indicator-ready", "true");

    const geometry = () =>
      tabs.evaluate((element) => {
        const active = element.querySelector<HTMLElement>(
          '[data-slot="tabs-trigger"][data-state="active"]',
        );
        const style = getComputedStyle(element);
        const indicator = getComputedStyle(element, "::before");
        return {
          x: parseFloat(style.getPropertyValue("--timeline-indicator-x")),
          width: parseFloat(
            style.getPropertyValue("--timeline-indicator-width"),
          ),
          activeX: active?.offsetLeft,
          activeWidth: active?.offsetWidth,
          transition: indicator.transitionProperty,
        };
      });

    const initial = await geometry();
    expect(initial.x).toBe(initial.activeX);
    expect(initial.width).toBe(initial.activeWidth);

    await page.locator(".feed").evaluate((element) => {
      const start = new Touch({
        identifier: 1,
        target: element,
        clientX: 300,
        clientY: 360,
      });
      const end = new Touch({
        identifier: 1,
        target: element,
        clientX: 175,
        clientY: 362,
      });
      element.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [start],
          targetTouches: [start],
          changedTouches: [start],
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [end],
        }),
      );
    });
    await expect(toolbar.getByRole("tab", { name: "ブログ" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect.poll(async () => (await geometry()).x).toBeGreaterThan(initial.x);
    const afterSwipe = await geometry();
    expect(afterSwipe.x).toBe(afterSwipe.activeX);
    expect(afterSwipe.width).toBe(afterSwipe.activeWidth);
    expect(afterSwipe.transition).toContain("transform");

    await toolbar.getByRole("tab", { name: "つぶやき" }).click();
    await expect(toolbar.getByRole("tab", { name: "つぶやき" })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect.poll(async () => (await geometry()).x).toBeGreaterThan(afterSwipe.x);
    const afterTap = await geometry();
    expect(afterTap.x).toBe(afterTap.activeX);
    expect(afterTap.width).toBe(afterTap.activeWidth);
    await expect(page).toHaveURL(/\/timeline$/);
  });

  test("does not animate for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/timeline");
    const tabs = page.locator('[data-ds="timeline-tabs"]');
    await expect(tabs).toHaveAttribute("data-indicator-ready", "true");
    expect(
      await tabs.evaluate(
        (element) => getComputedStyle(element, "::before").transitionDuration,
      ),
    ).toBe("0s");
  });
});
