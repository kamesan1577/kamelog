import { test, expect } from "@playwright/test";

test("mobile Markdown help dialog can scroll to hidden content", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const result = await page.evaluate(() => {
    const dialog = document.createElement("div");
    dialog.className = "markdown-help-dialog";
    dialog.innerHTML = `
      <h2>Markdown記法ヘルプ</h2>
      <p>ブログで使える記法です。</p>
      <div class="markdown-help-list">
        ${Array.from({ length: 40 }, (_, index) => `<section><h3>項目${index + 1}</h3><p>説明</p><pre><code>syntax</code></pre></section>`).join("")}
      </div>
    `;
    document.body.append(dialog);

    const style = getComputedStyle(dialog);
    const before = {
      overflowY: style.overflowY,
      scrollHeight: dialog.scrollHeight,
      clientHeight: dialog.clientHeight,
    };
    dialog.scrollTop = 240;

    return { ...before, scrollTop: dialog.scrollTop };
  });

  expect(result.overflowY).toBe("auto");
  expect(result.scrollHeight).toBeGreaterThan(result.clientHeight);
  expect(result.scrollTop).toBeGreaterThan(0);
});
