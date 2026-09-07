import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";

test("blog content edits persist updatedAt without moving it for pin-only changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blog-updated-at-"));
  const publishedAt = "2026-01-02T03:04:05.000Z";
  let store = new Store(root);

  try {
    const created = store.save(
      "posts",
      "fictional-blog",
      {
        kind: "blog",
        title: "最初のタイトル",
        body: "最初の本文",
        date: publishedAt,
        tags: [],
        likes: 0,
        pinned: false,
      },
      undefined,
    );
    assert.equal(created.updatedAt, undefined);

    const edited = store.save(
      "posts",
      created.id,
      {
        kind: "blog",
        title: "更新したタイトル",
        body: created.body,
        date: created.date,
        tags: created.tags,
        likes: created.likes,
        pinned: created.pinned,
      },
      created.revision,
    );
    assert.equal(edited.date, publishedAt);
    assert.match(edited.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

    const pinned = store.save(
      "posts",
      edited.id,
      {
        kind: "blog",
        title: edited.title,
        body: edited.body,
        date: edited.date,
        tags: edited.tags,
        likes: edited.likes,
        pinned: true,
      },
      edited.revision,
    );
    assert.equal(pinned.updatedAt, edited.updatedAt);

    store.close();
    store = new Store(root);
    assert.equal(store.get("posts", pinned.id).updatedAt, edited.updatedAt);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
