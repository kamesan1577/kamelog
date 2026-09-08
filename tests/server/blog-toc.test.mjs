import assert from "node:assert/strict";
import test from "node:test";

import { buildTocEntries, tocSlug } from "../../lib/blog-toc.mjs";

test("tocSlug keeps Japanese text and normalizes punctuation and spaces", () => {
  assert.equal(tocSlug("  導入：まず やること！ "), "導入まず-やること");
  assert.equal(tocSlug("API / HTTP"), "api-http");
});

test("buildTocEntries skips empty headings and gives duplicates unique ids", () => {
  assert.deepEqual(
    buildTocEntries([
      { label: "導入", level: 2 },
      { label: "詳細", level: 3 },
      { label: "導入", level: 2 },
      { label: "   ", level: 4 },
    ]),
    [
      { id: "kamelog-toc-導入", label: "導入", level: 2 },
      { id: "kamelog-toc-詳細", label: "詳細", level: 3 },
      { id: "kamelog-toc-導入-2", label: "導入", level: 2 },
    ],
  );
});

test("buildTocEntries preserves an existing heading id", () => {
  assert.deepEqual(buildTocEntries([{ id: "custom", label: "導入", level: 2 }]), [
    { id: "custom", label: "導入", level: 2 },
  ]);
});
