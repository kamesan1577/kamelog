import test from "node:test";
import assert from "node:assert/strict";
import { hasTweetContent, tweetPostInput } from "../../lib/tweet-composer.mjs";

test("tweetPostInput keeps one payload contract and adds parent context only for replies", () => {
  assert.deepEqual(
    tweetPostInput({
      body: "  reply  ",
      images: ["/api/media/image"],
      parentId: "parent-1",
      federationEnabled: true,
    }),
    {
      kind: "tweet",
      title: "",
      body: "reply",
      tags: [],
      pinned: false,
      images: ["/api/media/image"],
      federationEnabled: true,
      parentId: "parent-1",
    },
  );
  assert.equal(
    tweetPostInput({ body: "normal", federationEnabled: false }).parentId,
    undefined,
  );
});

test("hasTweetContent allows image-only tweets but rejects whitespace-only input", () => {
  assert.equal(hasTweetContent("   ", []), false);
  assert.equal(hasTweetContent("", ["/api/media/image"]), true);
});
