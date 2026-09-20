import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import {
  inferThreadForPost,
  processThreadInferenceJobs,
  threadCandidates,
} from "../../server/thread-inference.mjs";

test("fake ThreadInference links only a supplied recent candidate and preserves manual parent", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-thread-inference-"));
  const store = new Store(root);
  try {
    store.save("posts", "root", {
      kind: "tweet",
      title: "",
      body: "前半",
      tags: [],
      date: "2026-01-01T00:00:00.000Z",
    });
    store.save("posts", "candidate", {
      kind: "tweet",
      title: "",
      body: "後半",
      tags: [],
      date: "2026-01-01T00:01:00.000Z",
    });
    const result = await inferThreadForPost(store, "candidate", {
      async inferParent({ candidates }) {
        return { status: "linked", parentId: candidates[0].id };
      },
    });
    assert.deepEqual(result, { status: "linked", parentId: "root" });
    assert.equal(store.get("posts", "candidate").effectiveParentId, "root");

    store.save("posts", "manual", {
      kind: "tweet",
      title: "",
      body: "手動",
      tags: [],
      parentId: "root",
      date: "2026-01-01T00:02:00.000Z",
    });
    assert.deepEqual(await inferThreadForPost(store, "manual", {}), {
      status: "skipped",
    });
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("thread jobs use FakeThreadInference without Jev and keep rejection durable", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-thread-job-"));
  const store = new Store(root);
  try {
    store.save("posts", "root", {
      kind: "tweet",
      title: "",
      body: "先行投稿",
      tags: [],
      date: "2026-01-01T00:00:00.000Z",
    });
    store.save("posts", "follow-up", {
      kind: "tweet",
      title: "",
      body: "それの続き",
      tags: [],
      date: "2026-01-01T00:02:00.000Z",
    });
    store.enqueueInferenceJob({
      task: "thread",
      postId: "follow-up",
      inputHash: "fixture-input",
      engineId: "fake-thread-v1",
    });
    const summary = await processThreadInferenceJobs(store, {
      async inferParent({ candidates }) {
        return { status: "linked", parentId: candidates[0].id };
      },
    });
    assert.deepEqual(summary, {
      processed: 1,
      linked: 1,
      independent: 0,
      abstained: 0,
      retried: 0,
      dead: 0,
    });
    assert.equal(store.get("posts", "follow-up").effectiveParentId, "root");
    store.rejectInferredThreadLink("follow-up");
    assert.equal(store.get("posts", "follow-up").effectiveParentId, undefined);
    assert.deepEqual(await inferThreadForPost(store, "follow-up", {}), {
      status: "skipped",
    });
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("thread candidates exclude replies and posts outside the 30 minute window", () => {
  const target = {
    id: "target",
    kind: "tweet",
    body: "続き",
    date: "2026-01-01T01:00:00.000Z",
  };
  assert.deepEqual(
    threadCandidates(
      [
        {
          id: "recent",
          kind: "tweet",
          body: "直前",
          date: "2026-01-01T00:59:00.000Z",
        },
        {
          id: "reply",
          kind: "tweet",
          body: "返信",
          parentId: "recent",
          date: "2026-01-01T00:58:00.000Z",
        },
        {
          id: "old",
          kind: "tweet",
          body: "古い",
          date: "2026-01-01T00:20:00.000Z",
        },
      ],
      target,
    ),
    [{ id: "recent", body: "直前", createdAt: "2026-01-01T00:59:00.000Z" }],
  );
});
