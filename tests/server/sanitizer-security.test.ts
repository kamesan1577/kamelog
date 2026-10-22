import assert from "node:assert/strict";
import test from "node:test";
import sanitizeHtml from "sanitize-html";
import katex from "katex";
import { sanitizeRemoteHtml } from "../../server/federation-content.mjs";

test("discarded noscript content cannot escape through an implied ancestor close", () => {
  const result = sanitizeHtml(
    '<div><noscript></div><img src="https://example.test/beacon"></noscript>',
    {
      allowedTags: ["div", "img"],
      allowedAttributes: { img: ["src"] },
      nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    },
  );
  assert.doesNotMatch(result, /<img|beacon/);
});

test("math rendering does not inherit a trusted renderer setting", () => {
  const options = Object.create({ trust: true });
  const result = katex.renderToString(
    String.raw`\href{javascript:alert(1)}{click}`,
    options,
  );
  assert.doesNotMatch(result, /href=["']javascript:/);
});

test("remote HTML rejects active tags and unsafe links while preserving text", () => {
  const result = sanitizeRemoteHtml(
    '<p>Hello <strong>world</strong></p><svg><animate attributeName="href" values="javascript:alert(1)" /></svg><meta http-equiv="refresh" content="0;url=javascript:alert(1)"><a href="javascript:alert(1)">link</a>',
  );
  assert.match(result, /Hello <strong>world<\/strong>/);
  assert.doesNotMatch(result, /<svg|<animate|<meta|javascript:/);
});
