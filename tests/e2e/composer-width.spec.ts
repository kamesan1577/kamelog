import { expect, test } from "@playwright/test";

for (const width of [320, 390]) {
  test(`mobile composer keeps controls inside its dialog at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 520 });
    // Isolate layout from passkey setup; no write request is made in this test.
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { authenticated: true } }),
    );
    await page.route("**/api/drafts", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/federation/status", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/inference/status", (route) =>
      route.fulfill({ json: {} }),
    );
    await page.goto("/timeline");
    await page.locator('[data-ds="mobile-create"]').click();
    const dialog = page.locator('[data-ds="editor-dialog"]');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await dialog.evaluate(async (element) => {
      await Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      );
    });

    const expectContained = async () => {
      await expect
        .poll(() =>
          dialog.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
          ),
        )
        .toBe(true);
      const header = dialog.locator('[data-ds="mobile-editor-header"]');
      await dialog.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(
        header.getByRole("button", { name: "投稿", exact: true }),
      ).toBeInViewport();
      // Switching kind changes the dialog's geometry. Read both rectangles in
      // one frame after its transition, rather than comparing separate frames.
      await expect
        .poll(() =>
          dialog.evaluate((element) => {
            const headerElement = element.querySelector<HTMLElement>(
              '[data-ds="mobile-editor-header"]',
            );
            if (!headerElement) return false;
            const dialogBox = element.getBoundingClientRect();
            const headerBox = headerElement.getBoundingClientRect();
            const settled = element
              .getAnimations()
              .every((animation) => animation.playState === "finished");
            return (
              settled &&
              element.scrollWidth <= element.clientWidth &&
              headerBox.left >= dialogBox.left &&
              headerBox.right <= dialogBox.right
            );
          }),
        )
        .toBe(true);
    };

    for (const kind of ["つぶやき", "ブログ", "vlog"]) {
      await dialog
        .locator(".editor-kinds")
        .getByRole("tab", { name: kind })
        .click();
      await expectContained();
      if (kind !== "vlog") {
        await expect(dialog.locator(".body-input")).toHaveCSS(
          "font-size",
          "16px",
        );
      }
      if (kind === "ブログ") {
        await dialog.getByRole("button", { name: "フルページで編集" }).click();
        await expect(dialog).toHaveAttribute("data-ds-state", "full-page");
        await expectContained();
        await expect(dialog.locator(".body-input")).toHaveCSS(
          "font-size",
          "16px",
        );
        await dialog
          .getByRole("button", { name: "モーダル表示に戻す" })
          .click();
        await expect(dialog).toHaveAttribute("data-ds-state", "modal");
      }
    }
  });
}
