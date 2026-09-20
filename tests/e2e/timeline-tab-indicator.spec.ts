import { expect, test } from "@playwright/test";

test.describe("timeline tab indicator", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("tracks swipe and tap selection", async ({ page }) => {
    await page.goto("/timeline");
    const toolbar = page.locator('[data-ds="timeline-toolbar"]');
    const tabs = toolbar.locator('[data-ds="timeline-tabs"]');
    await expect(tabs).toHaveAttribute("data-indicator-ready", "true");

    const geometry = () =>
      tabs.evaluate((element) => {
        const active = element.querySelector<HTMLElement>(
          '[data-slot="tabs-trigger"][data-state="active"]',
        );
        const styles = getComputedStyle(element);
        const x = styles.getPropertyValue("--timeline-indicator-x");
        const width = styles.getPropertyValue("--timeline-indicator-width");
        return {
          x: parseFloat(x),
          width: parseFloat(width),
          activeX: active?.offsetLeft,
          activeWidth: active?.offsetWidth,
          transition: getComputedStyle(element, "::before").transitionProperty,
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
    const blog = toolbar.getByRole("tab", { name: "ブログ" });
    await expect(blog).toHaveAttribute("data-state", "active");
    const swiped = await geometry();
    expect(swiped.x).toBe(swiped.activeX);
    expect(swiped.width).toBe(swiped.activeWidth);
    expect(swiped.x).toBeGreaterThan(initial.x);
    expect(swiped.transition).toContain("transform");

    const tweets = toolbar.getByRole("tab", { name: "つぶやき" });
    await tweets.click();
    await expect(tweets).toHaveAttribute("data-state", "active");
    const tapped = await geometry();
    expect(tapped.x).toBe(tapped.activeX);
    expect(tapped.width).toBe(tapped.activeWidth);
    expect(tapped.x).toBeGreaterThan(swiped.x);
    await expect(page).toHaveURL(/\/timeline$/);
  });

  test("respects reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/timeline");
    const tabs = page.locator('[data-ds="timeline-tabs"]');
    await expect(tabs).toHaveAttribute("data-indicator-ready", "true");
    const duration = await tabs.evaluate(
      (element) => getComputedStyle(element, "::before").transitionDuration,
    );
    expect(duration).toBe("0s");
  });
});
