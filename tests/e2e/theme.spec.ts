import { expect, test, type Locator, type Page } from "@playwright/test";

const storageKey = "kamelog:theme";

function themeControl(page: Page) {
  return page.getByRole("combobox", { name: "表示テーマ", exact: true });
}

function runtimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydrat|Minified React error/i.test(message.text())
    )
      errors.push(message.text());
  });
  return errors;
}

// Resolve CSS colors through the browser, including light-dark(), color-mix()
// and transparent ancestors, instead of pinning the tests to one palette.
async function colors(locator: Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas color conversion is unavailable");
    function rgba(value: string) {
      context!.clearRect(0, 0, 1, 1);
      context!.fillStyle = value;
      context!.fillRect(0, 0, 1, 1);
      return Array.from(context!.getImageData(0, 0, 1, 1).data);
    }
    function composite(front: number[], back: number[]) {
      const alpha = front[3] / 255;
      return front.slice(0, 3).map((v, i) => v * alpha + back[i] * (1 - alpha));
    }
    function luminance(color: number[]) {
      const linear = color.slice(0, 3).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    }
    const ancestors: Element[] = [];
    for (
      let current: Element | null = element;
      current;
      current = current.parentElement
    )
      ancestors.unshift(current);
    let background = [255, 255, 255];
    for (const ancestor of ancestors)
      background = composite(
        rgba(getComputedStyle(ancestor).backgroundColor),
        background,
      );
    const foreground = composite(
      rgba(getComputedStyle(element).color),
      background,
    );
    const bg = luminance(background);
    const fg = luminance(foreground);
    return {
      backgroundLuminance: bg,
      contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
    };
  });
}

async function expectSurface(locator: Locator, theme: "light" | "dark") {
  await expect
    .poll(async () => (await colors(locator)).backgroundLuminance)
    [theme === "dark" ? "toBeLessThan" : "toBeGreaterThan"](
      theme === "dark" ? 0.15 : 0.75,
    );
}

async function expectTheme(page: Page, theme: "light" | "dark") {
  await expectSurface(page.locator("body"), theme);
}

async function expectReadable(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => (await colors(locator)).contrast)
    .toBeGreaterThanOrEqual(4.5);
}

async function expectBrowserChromeMatches(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const active = Array.from(
          document.querySelectorAll<HTMLMetaElement>(
            'meta[name="theme-color"]',
          ),
        ).filter((meta) => !meta.media || matchMedia(meta.media).matches);
        if (active.length !== 1) return false;
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return false;
        context.fillStyle = active[0].content;
        const browserChrome = context.fillStyle;
        context.fillStyle = getComputedStyle(document.body).backgroundColor;
        return browserChrome === context.fillStyle;
      }),
    )
    .toBe(true);
}

test("the default follows system appearance, including changes while the page is open", async ({
  page,
}) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(themeControl(page)).toHaveValue("system");
  await expectTheme(page, "dark");
  await expectBrowserChromeMatches(page);
  await expectReadable(themeControl(page));
  await page.emulateMedia({ colorScheme: "light" });
  await expectTheme(page, "light");
  await expectBrowserChromeMatches(page);
  await expect(themeControl(page)).toHaveValue("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme(page, "dark");
  expect(errors).toEqual([]);
});

test("explicit choices survive navigation and reload and override the operating system", async ({
  page,
}) => {
  const errors = runtimeErrors(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await themeControl(page).selectOption("light");
  await expectTheme(page, "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await expectBrowserChromeMatches(page);
  await page
    .getByRole("button", { name: "タイムライン", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/timeline$/);
  await expect(themeControl(page)).toHaveValue("light");
  await page.reload();
  await expect(themeControl(page)).toHaveValue("light");
  await expectTheme(page, "light");
  await page.emulateMedia({ colorScheme: "light" });
  await themeControl(page).selectOption("dark");
  await expectTheme(page, "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expectBrowserChromeMatches(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expectTheme(page, "dark");
  await page.reload();
  await expect(themeControl(page)).toHaveValue("dark");
  await expectTheme(page, "dark");
  await themeControl(page).selectOption("system");
  await expectTheme(page, "light");
  await page.reload();
  await expect(themeControl(page)).toHaveValue("system");
  await page.emulateMedia({ colorScheme: "dark" });
  await expectTheme(page, "dark");
  expect(errors).toEqual([]);
});

test("other tabs synchronize changes, invalid preferences and clearing storage", async ({
  page,
  context,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/projects");
  await expect(themeControl(other)).toHaveValue("system");
  await themeControl(page).selectOption("dark");
  await expect(themeControl(other)).toHaveValue("dark");
  await expectTheme(other, "dark");
  await themeControl(other).selectOption("light");
  await expect(themeControl(page)).toHaveValue("light");
  await expectTheme(page, "light");
  await other.evaluate(
    (key) => localStorage.setItem(key, "invalid-preference"),
    storageKey,
  );
  await expect(themeControl(page)).toHaveValue("system");
  await themeControl(page).selectOption("dark");
  await expect(themeControl(other)).toHaveValue("dark");
  await other.evaluate(() => localStorage.clear());
  await expect(themeControl(page)).toHaveValue("system");
  await expectTheme(page, "light");
  await other.close();
});

for (const preference of ["invalid-preference", "{broken-json"]) {
  test(`an invalid saved preference falls back to the system: ${preference}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      {
        key: storageKey,
        value: preference,
      },
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(themeControl(page)).toHaveValue("system");
    await expectTheme(page, "dark");
    await themeControl(page).selectOption("light");
    await expectTheme(page, "light");
  });
}

for (const failure of ["unavailable", "quota"] as const) {
  test(`a ${failure} storage failure does not prevent changing appearance`, async ({
    page,
  }) => {
    const errors = runtimeErrors(page);
    await page.addInitScript((mode) => {
      if (mode === "unavailable") {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage is disabled", "SecurityError");
          },
        });
      } else {
        Storage.prototype.setItem = () => {
          throw new DOMException("Storage is full", "QuotaExceededError");
        };
      }
    }, failure);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expectTheme(page, "dark");
    await themeControl(page).selectOption("light");
    await expectTheme(page, "light");
    await page
      .getByRole("button", { name: "タイムライン", exact: true })
      .first()
      .click();
    await expect(themeControl(page)).toHaveValue("light");
    await expectTheme(page, "light");
    await themeControl(page).selectOption("system");
    await expectTheme(page, "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expectTheme(page, "light");
    expect(errors).toEqual([]);
  });
}

for (const preference of ["light", "dark"] as const) {
  test(`saved ${preference} appearance is applied before hydration`, async ({
    browser,
    baseURL,
  }) => {
    if (!baseURL) throw new Error("baseURL is required");
    const context = await browser.newContext({
      baseURL,
      colorScheme: preference === "dark" ? "light" : "dark",
      storageState: {
        cookies: [],
        origins: [
          {
            origin: baseURL,
            localStorage: [{ name: storageKey, value: preference }],
          },
        ],
      },
    });
    try {
      // Keep the document, CSS and inline bootstrap, but prevent React from
      // loading. A useEffect-only implementation would paint the wrong theme.
      await context.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, (route) =>
        route.abort(),
      );
      const page = await context.newPage();
      await page.goto("/");
      await expectTheme(page, preference);
      await expect(page.locator("html")).toHaveCSS("color-scheme", preference);
      await expectReadable(page.locator("h1").first());
    } finally {
      await context.close();
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`without JavaScript the page still follows the ${colorScheme} system appearance`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      javaScriptEnabled: false,
      colorScheme,
    });
    try {
      const page = await context.newPage();
      await page.goto("/");
      await expectTheme(page, colorScheme);
      await expectReadable(page.locator("h1").first());
      await page.emulateMedia({
        colorScheme: colorScheme === "dark" ? "light" : "dark",
      });
      await expectTheme(page, colorScheme === "dark" ? "light" : "dark");
    } finally {
      await context.close();
    }
  });
}

for (const width of [390, 1280]) {
  test(`theme selection is keyboard accessible and fits at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    const control = themeControl(page);
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    await control.press("End");
    await expect(control).toHaveValue("dark");
    await expectTheme(page, "dark");
    await expect(control).toBeFocused();
    await expect(control).toBeInViewport();
    await expectReadable(control);
    expect(
      await control.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).not.toBe("none");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`theme-control-${width}.png`),
    });
    await control.press("Home");
    await expect(control).toHaveValue("system");
    await expectTheme(page, "light");
    await expect(page.locator('[data-ds="inline-composer"]')).toHaveCount(0);
    await expect(page.locator('[data-ds="mobile-create"]')).toHaveCount(0);
  });
}

test("public routes and native form fields remain readable in both appearances", async ({
  page,
}) => {
  for (const theme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const path of [
      "/",
      "/timeline",
      "/projects",
      "/federation",
      "/missing-theme-fixture",
      "/setup",
    ]) {
      await page.goto(path);
      await expectTheme(page, theme);
      await expect(themeControl(page)).toBeEnabled();
      await expectReadable(page.locator("h1").first());
      await expectSurface(page.locator("h1").first(), theme);
      if (path === "/timeline") {
        await page.setViewportSize({ width: 1280, height: 900 });
        await expectReadable(page.locator('[data-ds="side-search"] input'));
        await expectSurface(
          page.locator('[data-ds="side-search"] input'),
          theme,
        );
      }
      if (path === "/setup") {
        await expectReadable(page.getByLabel("登録トークン"));
        await expectSurface(page.getByLabel("登録トークン"), theme);
        await expectReadable(
          page.getByRole("button", { name: "パスキーを登録", exact: true }),
        );
      }
    }
  }
});

test("reader, code, diagrams and X embeds follow live appearance changes", async ({
  page,
}, testInfo) => {
  const post = {
    id: "fictional-theme-blog",
    kind: "blog",
    title: "配色を確認する架空の記事",
    body: [
      "## 本文の配色",
      "本文と `inline code` の読みやすさを確認します。",
      "> 架空の記事の引用です。",
      '```typescript\n// A fictional code example\nconst greeting: string = "hello";\nconsole.log(greeting);\n```',
      "| 項目 | 内容 |\n| --- | --- |\n| テーマ | システム |",
      "```mermaid\ngraph TD\n  A[入力] --> B[表示]\n```",
      "https://x.com/fictional/status/1234567890123456789",
    ].join("\n\n"),
    revision: 1,
    date: "2026-10-01T12:00:00.000Z",
    tags: ["確認"],
    autoTags: [],
    likes: 0,
    views: 0,
    images: [],
  };
  await page.route("**/api/posts", (route) => route.fulfill({ json: [post] }));
  await page.route("**/api/federation/reposts", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://platform.twitter.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Fictional X embed</title>",
    }),
  );
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/timeline");
  await page.getByRole("button", { name: "タイムラインを更新" }).click();
  await page.locator(`[data-reader-opener="${post.id}"]`).click();
  const reader = page.locator('[data-ds="post-reader"]');
  const markdown = reader.locator('[data-ds="detail-markdown"]');
  const diagram = reader.getByRole("img", { name: "Mermaid図" });
  const embed = reader.getByTitle("Xの投稿");
  await expect(reader).toHaveAttribute("role", "dialog");
  await expect(diagram.locator("svg")).toHaveCount(1);
  const node = diagram.locator(".node rect").first();
  const lightNodeFill = await node.evaluate(
    (element) => getComputedStyle(element).fill,
  );
  for (const theme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expectTheme(page, theme);
    await expect(diagram).toHaveAttribute("aria-busy", "false");
    await expect(embed).toHaveAttribute("src", new RegExp(`theme=${theme}`));
    for (const selector of [
      "h1",
      "p",
      "p code",
      "blockquote",
      "th",
      "td",
      "pre code.hljs",
      "pre .hljs-comment",
      "pre .hljs-keyword",
      "pre .hljs-string",
    ]) {
      await expectReadable(markdown.locator(selector).first());
      await expectSurface(markdown.locator(selector).first(), theme);
    }
    const surface = await colors(reader);
    if (theme === "dark") {
      expect(surface.backgroundLuminance).toBeLessThan(0.15);
      await expect(node).not.toHaveCSS("fill", lightNodeFill);
    } else {
      expect(surface.backgroundLuminance).toBeGreaterThan(0.75);
      await expect(node).toHaveCSS("fill", lightNodeFill);
    }
    await page.screenshot({ path: testInfo.outputPath(`reader-${theme}.png`) });
  }
  await reader.getByRole("button", { name: "投稿を閉じる" }).click();
  await expect(reader).toHaveCount(0);
});

for (const width of [390, 1280]) {
  test(`owner editor and failure notification follow appearance without losing input at ${width}px`, async ({
    page,
  }, testInfo) => {
    const errors = runtimeErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.addInitScript(() => {
      localStorage.setItem("kamelog:x-intent:tweet", "false");
    });
    // Authentication has its own passkey journey. Isolate this owner UI test
    // from that shared account and never write posts or credentials.
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { authenticated: true } }),
    );
    await page.route("**/api/federation/status", (route) =>
      route.fulfill({ json: { enabled: false } }),
    );
    await page.route("**/api/inference/status", (route) =>
      route.fulfill({ json: {} }),
    );
    await page.route("**/api/drafts", (route) => route.fulfill({ json: [] }));
    const failureMessage = "架空の通信エラーです。本文を残して再試行できます。";
    let postAttempts = 0;
    await page.route("**/api/posts", (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: [] });
      postAttempts++;
      return route.fulfill({ status: 503, json: { error: failureMessage } });
    });
    await page.goto("/timeline");
    if (width === 390) await page.locator('[data-ds="mobile-create"]').click();
    else
      await page.getByRole("button", { name: "新規投稿", exact: true }).click();
    const editor = page.locator('[data-ds="editor-dialog"]');
    const body = editor.getByPlaceholder("本文", { exact: true });
    const publish = editor.getByRole("button", { name: "投稿", exact: true });
    const text = "テーマを切り替えても残る、編集中の架空の本文。";
    await body.fill(text);
    await body.evaluate((element: HTMLTextAreaElement) =>
      element.setSelectionRange(3, 8),
    );
    for (const theme of ["dark", "light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expectSurface(editor, theme);
      await expectSurface(body, theme);
      await expectReadable(body);
      await expectReadable(publish);
      await expect(body).toHaveValue(text);
      await expect(body).toBeFocused();
      expect(
        await body.evaluate((element: HTMLTextAreaElement) => [
          element.selectionStart,
          element.selectionEnd,
        ]),
      ).toEqual([3, 8]);
    }

    await publish.click();
    await expect.poll(() => postAttempts).toBe(1);
    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: failureMessage });
    await expect(toast).toBeVisible();
    await expectReadable(toast.locator("[data-title]"));
    for (const theme of ["dark", "light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.locator("[data-sonner-toaster]")).toHaveAttribute(
        "data-sonner-theme",
        theme,
      );
      await expectSurface(toast, theme);
      await expectReadable(toast.locator("[data-title]"));
      await expect(body).toHaveValue(text);
      await expect(editor).toBeVisible();
    }
    await page.screenshot({
      path: testInfo.outputPath(`owner-dark-${width}.png`),
    });

    await body.focus();
    await body.press("Escape");
    const confirmation = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "この投稿を保存しますか？" }),
    });
    await expectSurface(confirmation, "dark");
    await expectReadable(confirmation.getByRole("heading"));
    await expectReadable(
      confirmation.getByRole("button", { name: "下書き保存", exact: true }),
    );
    await confirmation.getByRole("button", { name: "編集を続ける" }).click();
    await expect(body).toHaveValue(text);
    await expect(editor).toBeVisible();
    expect(errors).toEqual([]);
  });
}
