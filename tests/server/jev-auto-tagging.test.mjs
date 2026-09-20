import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import { autoTagPosts, selectTagCandidates } from "../../server/auto-tagging.mjs";

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "kamelog-jev-tags-"));
  const store = new Store(root);
  try {
    store.save("posts", "teacher", {
      kind: "tweet", title: "", body: "GolangでAPIを作った", tags: ["Go"],
    });
    store.save("posts", "target", {
      kind: "tweet", title: "", body: "GolangのAPIができた", tags: [],
    });
    await fn(store);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("fake inference remains provider-free; preserves manual tags, null confidence and idempotency", async () => {
  await fixture(async (store) => {
    let calls = 0;
    const fake = {
      modelVersion: "fake-v1", engineId: "fake", adapterVersion: "test-v1",
      async inferTags({ post, candidates }) {
        calls++;
        assert.ok(candidates.every(({ tag }) => tag === "Go"));
        return { status: "classified", tags: post.id === "target" ? [{ tag: "Go" }] : [] };
      },
    };
    assert.equal((await autoTagPosts(store, { tagInference: fake })).processed, 2);
    assert.deepEqual(store.get("posts", "teacher").tags, ["Go"]);
    const target = store.get("posts", "target");
    assert.deepEqual(target.tags, ["Go"]);
    assert.deepEqual(target.autoTags.map(({ tag }) => tag), ["Go"]);
    assert.equal("confidence" in target.autoTags[0], false);
    assert.equal(store.autoTagState("target").model_version, "fake-v1");
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM inference_runs WHERE task='tag'").get().n, 2);
    assert.equal((await autoTagPosts(store, { tagInference: fake })).skipped, 2);
    assert.equal(calls, 1); // teacher has no remaining candidates
  });
});

test("abstentions, invalid candidates and failures preserve old tags for retry", async () => {
  await fixture(async (store) => {
    const fixtureModel = { modelVersion: "fake-v1", async inferTags() {
      return { status: "classified", tags: [{ tag: "Go" }] };
    } };
    await autoTagPosts(store, { tagInference: fixtureModel });
    store.save("posts", "target", {
      kind: "tweet", title: "", body: "本文を編集した", tags: [],
    }, 1);
    const before = store.autoTagState("target");
    for (const inferTags of [
      async () => { throw new Error("offline"); },
      async () => ({ status: "abstained", tags: [] }),
      async () => ({ status: "classified", tags: [{ tag: "invented" }] }),
    ]) {
      const failed = await autoTagPosts(store, {
        tagInference: { ...fixtureModel, inferTags },
      });
      assert.equal(failed.failed, 1);
      assert.deepEqual(store.get("posts", "target").tags, ["Go"]);
      assert.deepEqual(store.autoTagState("target"), before);
    }
    const retry = await autoTagPosts(store, {
      tagInference: { ...fixtureModel, inferTags: async () => ({ status: "classified", tags: [] }) },
    });
    assert.equal(retry.processed, 1);
    assert.deepEqual(store.get("posts", "target").tags, []);
    assert.equal((await autoTagPosts(store, { tagInference: fixtureModel })).skipped, 2);
  });
});

test("explicit hashtags are deterministic but unknown tags are never invented", async () => {
  await fixture(async (store) => {
    store.save("posts", "target", {
      kind: "tweet", title: "", body: "#Go #架空の未知タグ について", tags: [],
    }, 1);
    const result = await autoTagPosts(store, {
      tagInference: { modelVersion: "no-match", async inferTags() {
        return { status: "classified", tags: [] };
      } },
    });
    assert.equal(result.failed, 0);
    assert.deepEqual(store.get("posts", "target").tags, ["Go"]);
    assert.deepEqual(store.get("posts", "teacher").tags, ["Go"]);
  });
});

test("candidate shortlist keeps an exact alias match despite its ranking limit", () => {
  const candidates = Array.from({ length: 20 }, (_, i) => ({
    tag: `tag-${i}`, aliases: [], examples: ["無関係"],
  }));
  candidates[19].aliases = ["Golang"];
  const selected = selectTagCandidates({ title: "", body: "Golangで作った" }, candidates, 10);
  assert.equal(selected.length, 10);
  assert.equal(selected[0].tag, "tag-19");
});

test("tag toggle is independent and disables all inference calls", async () => {
  await fixture(async (store) => {
    let called = 0;
    const fake = { modelVersion: "fake-v1", async inferTags() {
      called++;
      return { status: "classified", tags: [] };
    } };
    assert.equal((await autoTagPosts(store, { tagInference: fake, requireEnabled: true })).disabled, true);
    assert.equal(called, 0);
    store.saveInferenceSettings({ autoTagEnabled: true, autoThreadEnabled: false });
    const enabled = await autoTagPosts(store, { tagInference: fake, requireEnabled: true });
    assert.equal(enabled.processed, 2);
    assert.equal(called, 1);
    assert.equal(store.inferenceSettings().autoThreadEnabled, false);
  });
});
