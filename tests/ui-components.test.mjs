import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => {
  await vite.close();
});

async function readCssTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const contents = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return readCssTree(entryPath);
      }
      return entry.name.endsWith(".css") ? readFile(entryPath, "utf8") : "";
    }),
  );
  return contents.join("\n");
}

test("emits the catalog's animation and scrolling utilities", async () => {
  const css = await readCssTree(path.join(root, ".next/static"));

  assert.match(css, /--tw-enter-opacity/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.match(css, /scroll-fade-reveal-b/);
  assert.match(css, /mask-image:/);
  assert.match(css, /tw-shimmer/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test("forwards progress semantics to the primitive", async () => {
  const { Progress } = await vite.ssrLoadModule("/components/ui/progress.tsx");
  const html = renderToStaticMarkup(
    React.createElement(Progress, { value: 37 }),
  );

  assert.match(html, /aria-valuenow="37"/);
  assert.match(html, /aria-valuetext="37%"/);
  assert.match(html, /data-state="loading"/);
});

test("emits chart themes for the starter's media dark mode", async () => {
  const { ChartStyle } = await vite.ssrLoadModule("/components/ui/chart.tsx");
  const html = renderToStaticMarkup(
    React.createElement(ChartStyle, {
      id: "contract",
      config: {
        latency: { theme: { light: "#ffffff", dark: "#000000" } },
      },
    }),
  );

  assert.match(html, /\[data-chart=contract\]/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  assert.doesNotMatch(html, /\.dark/);
});

test("renders sidebar skeletons deterministically", async () => {
  const { SidebarMenuSkeleton } = await vite.ssrLoadModule(
    "/components/ui/sidebar.tsx",
  );
  const first = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));
  const second = renderToStaticMarkup(React.createElement(SidebarMenuSkeleton));

  assert.equal(first, second);
  assert.match(first, /--skeleton-width:70%/);
});

test("renders GFM lists safely and highlights fenced code", async () => {
  const { Markdown } = await vite.ssrLoadModule("/app/notebook.tsx");
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      text: [
        "- item",
        "- [ ] todo",
        "- [x] done",
        "",
        "```javascript",
        "const answer = 42;",
        "```",
        "",
        "<script>alert(1)</script>",
      ].join("\n"),
    }),
  );

  assert.match(html, /<ul class="contains-task-list">/);
  assert.match(html, /type="checkbox" disabled=""/);
  assert.match(html, /class="hljs language-javascript"/);
  assert.match(html, /class="hljs-keyword">const<\/span>/);
  assert.doesNotMatch(html, /<script>/);
});

test("builds concise social card copy and limits vlog autoplay", async () => {
  const { socialCopy, shouldAutoplayVlog } =
    await vite.ssrLoadModule("/lib/social.ts");

  assert.equal(
    socialCopy({ kind: "blog", title: "記事タイトル", body: "本文" }),
    "記事タイトル",
  );
  assert.equal(
    socialCopy({
      kind: "tweet",
      title: "",
      body: "最初の一文です。次の文はカードに入りません。",
    }),
    "最初の一文です。",
  );
  assert.match(
    socialCopy({ kind: "tweet", title: "", body: "あ".repeat(100) }),
    /^あ{71}…$/,
  );
  assert.equal(shouldAutoplayVlog(10), true);
  assert.equal(shouldAutoplayVlog(10.01), false);
});
