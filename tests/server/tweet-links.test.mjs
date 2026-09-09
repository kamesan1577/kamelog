import assert from "node:assert/strict";
import test from "node:test";
import {
  firstHttpUrl,
  splitTweetText,
  trimTweetUrl,
} from "../../lib/tweet-links.mjs";

test("tweet URLs stay intact and trailing sentence punctuation is not part of the link", () => {
  const url =
    "https://ja.wikipedia.org/wiki/%E3%83%86%E3%82%B9%E3%83%88%E9%A0%85%E7%9B%AE";
  const parts = splitTweetText(`参照 ${url}。次も読む`);
  assert.deepEqual(parts, [
    { type: "text", value: "参照 " },
    { type: "url", value: url },
    { type: "text", value: "。次も読む" },
  ]);
  assert.equal(firstHttpUrl(`参照 ${url}。`), url);
});

test("balanced URL parentheses are preserved while unmatched closing punctuation is trimmed", () => {
  assert.equal(
    trimTweetUrl("https://example.com/a_(b)"),
    "https://example.com/a_(b)",
  );
  assert.equal(
    trimTweetUrl("https://example.com/a_(b))."),
    "https://example.com/a_(b)",
  );
});
