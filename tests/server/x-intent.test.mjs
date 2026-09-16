import test from "node:test";
import assert from "node:assert/strict";
import {
  buildXIntentUrl,
  buildXShareText,
  getXWeightedLength,
} from "../../lib/x-intent.mjs";

const url = "https://kamesan.org/?post=abc123";

test("short posts and blog titles retain their canonical URL", () => {
  assert.equal(
    buildXShareText({ kind: "tweet", body: "こんにちは" }, url),
    `こんにちは\n${url}`,
  );
  assert.equal(
    buildXShareText(
      { kind: "blog", title: "記事", body: "本文は送らない" },
      url,
    ),
    `記事\n${url}`,
  );
  assert.equal(
    new URL(
      buildXIntentUrl({ kind: "tweet", body: "Hi" }, url),
    ).searchParams.get("text"),
    `Hi\n${url}`,
  );
});

test("CJK, URL, emoji and ZWJ sequences fit the official weighted limit", () => {
  for (const body of [
    "あ".repeat(300),
    "a".repeat(300),
    "あbc".repeat(140),
    "👨‍👩‍👧‍👦".repeat(200),
    `https://example.com/something\n${"あ".repeat(200)}`,
  ]) {
    const result = buildXShareText({ kind: "tweet", body }, url);
    if (getXWeightedLength(`${body}\n${url}`) > 280)
      assert.ok(result.endsWith(`\n...\n${url}`));
    assert.ok(getXWeightedLength(result) <= 280);
    assert.ok(!result.includes("\ufffd"));
  }
});

test("an exact boundary preserves the original text", () => {
  const body = "a".repeat(256);
  assert.equal(getXWeightedLength(`${body}\n${url}`), 280);
  assert.equal(
    buildXShareText({ kind: "tweet", body }, url),
    `${body}\n${url}`,
  );
  assert.ok(
    buildXShareText({ kind: "tweet", body: body + "a" }, url).includes(
      "\n...\n",
    ),
  );
});
