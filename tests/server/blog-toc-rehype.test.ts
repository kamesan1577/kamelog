import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import type { Root } from "hast";

import rehypeBlogToc from "../../lib/blog-toc-rehype.ts";

function renderArticle(markdown: string) {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, { rehypePlugins: [rehypeBlogToc] }, markdown),
  );
}

function tableOfContents(html: string) {
  const navigation = html.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/)?.[0];
  assert.ok(navigation, "the initial HTML must contain the table of contents");
  assert.match(navigation, /data-ds="blog-table-of-contents"/);
  assert.match(navigation, /data-kamelog-blog-toc="react"/);
  assert.match(navigation, /aria-label="目次"/);
  assert.equal((html.match(/<nav\b/g) || []).length, 1);
  return navigation;
}

test("the initial article HTML includes its TOC inside the title header before the body", () => {
  const html = renderArticle(
    "# 記事の題名\n\n本文の導入。\n\n## 導入\n\n段落。",
  );
  const navigation = tableOfContents(html);
  assert.match(html, /<header data-ds="reader-article-header">/);
  assert.match(html, /<div data-ds="reader-toc-slot">/);
  assert.ok(html.indexOf("<h1>記事の題名</h1>") < html.indexOf(navigation));
  assert.ok(html.indexOf(navigation) < html.indexOf("</header>"));
  assert.ok(html.indexOf("</header>") < html.indexOf("<p>本文の導入。</p>"));
  assert.match(navigation, /<a href="#kamelog-toc-導入"[^>]*>導入<\/a>/);
  assert.match(html, /<h2\b[^>]*id="kamelog-toc-導入"/);
  assert.match(html, /<h2\b[^>]*data-kamelog-toc-generated="true"/);
});

test("TOC labels are plain text and Unicode duplicate headings retain distinct fragment targets", () => {
  const html = renderArticle(
    "# 題名\n\n## **導入** と `API`\n\n### 導入\n\n## 導入\n\n####\n\n###### 末尾\n\n# 本文中の題名",
  );
  const navigation = tableOfContents(html);
  assert.match(
    navigation,
    /<a href="#kamelog-toc-導入-と-api"[^>]*>導入 と API<\/a>/,
  );
  assert.match(navigation, /<a href="#kamelog-toc-導入"[^>]*>導入<\/a>/);
  assert.match(navigation, /<a href="#kamelog-toc-導入-2"[^>]*>導入<\/a>/);
  assert.match(navigation, /<a href="#kamelog-toc-末尾"[^>]*>末尾<\/a>/);
  assert.match(navigation, /data-ds="blog-table-of-contents-level-6"/);
  assert.equal((navigation.match(/<a\b/g) || []).length, 4);
  assert.doesNotMatch(navigation, /<strong>|<code>|本文中の題名/);
  assert.match(html, /<strong>導入<\/strong> と <code>API<\/code>/);
  assert.match(html, /<h2\b[^>]*id="kamelog-toc-導入-2"/);
  assert.match(html, /<h4><\/h4>/);
  assert.match(html, /<h1>本文中の題名<\/h1>/);
});

test("explicit heading IDs remain native link targets", () => {
  function explicitHeadingId() {
    return (tree: Root) => {
      const heading = tree.children.find(
        (node) => node.type === "element" && node.tagName === "h2",
      );
      assert.ok(heading?.type === "element");
      heading.properties.id = "existing-section";
    };
  }
  const html = renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      { rehypePlugins: [explicitHeadingId, rehypeBlogToc] },
      "# 題名\n\n## 導入\n\n### 詳細",
    ),
  );
  const navigation = tableOfContents(html);
  assert.match(navigation, /<a href="#existing-section"[^>]*>導入<\/a>/);
  assert.match(html, /<h2\b[^>]*id="existing-section"/);
  assert.match(navigation, /<a href="#kamelog-toc-詳細"[^>]*>詳細<\/a>/);
});

test("articles without an initial title get a leading TOC and articles without sections get none", () => {
  const withoutTitle = renderArticle("導入の段落。\n\n## 節");
  const navigation = tableOfContents(withoutTitle);
  assert.ok(
    withoutTitle.indexOf(navigation) <
      withoutTitle.indexOf("<p>導入の段落。</p>"),
  );
  assert.doesNotMatch(withoutTitle, /data-ds="reader-article-header"/);

  const withoutSections = renderArticle("# 題名\n\n本文のみ。");
  assert.match(withoutSections, /<header data-ds="reader-article-header">/);
  assert.match(withoutSections, /<h1>題名<\/h1>/);
  assert.doesNotMatch(withoutSections, /<nav\b|data-kamelog-blog-toc/);
  assert.match(withoutSections, /<p>本文のみ。<\/p>/);
});
