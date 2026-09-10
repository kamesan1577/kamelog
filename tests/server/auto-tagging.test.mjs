import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import {
  AUTO_TAG_MODEL_VERSION,
  autoTagPosts,
  classifyPosts,
} from "../../server/auto-tagging.mjs";

test("local classifier learns only from manual tags and normalizes to existing tags", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-auto-tag-"));
  const store = new Store(root);
  try {
    store.save("posts", "teacher", {
      kind: "tweet",
      title: "",
      body: "SQLiteのバックアップとデータベース設計を調べた #データベース",
      tags: ["データベース"],
    });
    store.save("posts", "target", {
      kind: "tweet",
      title: "",
      body: "SQLiteのデータベースとストレージを使ったバックアップ処理を実装した",
      tags: [],
    });
    const first = autoTagPosts(store);
    assert.equal(first.processed, 2);
    const tagged = store.get("posts", "target");
    assert.deepEqual(tagged.tags, ["データベース"]);
    assert.equal(tagged.autoTags[0].tag, "データベース");
    assert.equal(tagged.autoTags[0].modelVersion, AUTO_TAG_MODEL_VERSION);
    assert.match(tagged.autoTags[0].contentHash, /^[a-f0-9]{64}$/);
    assert.equal(autoTagPosts(store).skipped, 2);

    store.save(
      "posts",
      "teacher",
      {
        kind: "tweet",
        title: "",
        body: "SQLiteのストレージとデータベース設計を調べた #ストレージ",
        tags: ["ストレージ"],
      },
      1,
    );
    const second = autoTagPosts(store);
    assert.equal(second.processed, 2);
    assert.deepEqual(store.get("posts", "target").tags, ["ストレージ"]);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("classifier never trains on auto tags", () => {
  const { result } = classifyPosts([
    {
      id: "one",
      title: "",
      body: "RustでCLIを作った",
      tags: ["Rust"],
    },
    {
      id: "two",
      title: "",
      body: "Rustで別のCLIを作った",
      tags: [],
    },
  ]);
  assert.equal(result.get("two")[0].tag, "Rust");
});
