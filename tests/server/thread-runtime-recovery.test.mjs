import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  JevClient,
  JevThreadInference,
} from "../../server/inference/jev-client.mjs";
import { InferenceFailure } from "../../server/inference/ports.mjs";
import { Store } from "../../server/store.mjs";
import { processThreadInferenceJobs } from "../../server/thread-inference.mjs";

async function withStore(fn) {
  const root = await mkdtemp(join(tmpdir(), "kamelog-thread-recovery-"));
  const store = new Store(root);
  try {
    return await fn(store);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

function post(body, date) {
  return { kind: "tweet", title: "", body, tags: [], date };
}

function enqueue(store, postId) {
  store.enqueueInferenceJob({
    task: "thread",
    postId,
    inputHash: `input-${postId}`,
    engineId: "test",
  });
}

test("independent decisions complete jobs with and without candidates", async () => {
  await withStore(async (store) => {
    store.save("posts", "first", post("独立", "2026-01-01T00:00:00.000Z"));
    store.save("posts", "second", post("別件", "2026-01-01T00:01:00.000Z"));
    enqueue(store, "first");
    enqueue(store, "second");
    let calls = 0;
    const summary = await processThreadInferenceJobs(store, {
      async inferParent() {
        calls++;
        return { status: "independent", parentId: null };
      },
    });
    assert.deepEqual(summary, {
      processed: 2,
      linked: 0,
      independent: 2,
      abstained: 0,
      retried: 0,
      dead: 0,
    });
    assert.equal(calls, 1);
    assert.deepEqual(
      store.db
        .prepare("SELECT state FROM inference_jobs ORDER BY post_id")
        .all()
        .map(({ state }) => state),
      ["succeeded", "succeeded"],
    );
    assert.equal(store.inferredThreadLink("first").state, "independent");
    assert.equal(store.inferredThreadLink("second").state, "independent");
  });
});

test("Jev thread adapter uses named choice questions and typed answers", async () => {
  let request;
  let choice = "root";
  const inference = new JevThreadInference(
    new JevClient({
      apiKey: "fictional-api-key",
      fetchImpl: async (_url, init) => {
        request = JSON.parse(init.body);
        return Response.json({
          answers: { parent: { type: "choice", choice } },
        });
      },
    }),
  );
  const input = {
    post: { id: "follow-up", body: "それの続き" },
    candidates: [
      { id: "root", body: "最初の投稿", createdAt: "2026-01-01T00:00:00Z" },
    ],
  };
  assert.deepEqual(await inference.inferParent(input), {
    status: "linked",
    parentId: "root",
  });
  assert.equal(Array.isArray(request.questions), false);
  assert.deepEqual(Object.keys(request.questions), ["parent"]);
  assert.equal(request.questions.parent.type, "choice");
  assert.deepEqual(Object.keys(request.questions.parent.criteria), ["none", "root"]);
  assert.deepEqual(request.state, input);
  choice = "none";
  assert.deepEqual(await inference.inferParent(input), {
    status: "independent",
    parentId: null,
  });
  choice = "unknown";
  assert.deepEqual(await inference.inferParent(input), {
    status: "abstained",
    parentId: null,
  });
});

test("malformed Jev choice answers fail instead of silently abstaining", async () => {
  const inference = new JevThreadInference(
    new JevClient({
      apiKey: "fictional-api-key",
      fetchImpl: async () => Response.json({ answers: { parent: "root" } }),
    }),
  );
  await assert.rejects(
    inference.inferParent({
      post: { id: "follow-up", body: "続き" },
      candidates: [{ id: "root", body: "前半" }],
    }),
    (error) =>
      error instanceof InferenceFailure && error.code === "invalid_result",
  );
});

test("HTTP 422 status is retained and not retried as a temporary outage", async () => {
  await withStore(async (store) => {
    store.save("posts", "root", post("前半", "2026-01-01T00:00:00.000Z"));
    store.save(
      "posts",
      "follow-up",
      post("後半", "2026-01-01T00:01:00.000Z"),
    );
    enqueue(store, "follow-up");
    const inference = new JevThreadInference(
      new JevClient({
        apiKey: "fictional-api-key",
        fetchImpl: async () => new Response("do not log this", { status: 422 }),
      }),
    );
    const summary = await processThreadInferenceJobs(store, inference);
    assert.equal(summary.dead, 1);
    assert.equal(summary.retried, 0);
    assert.deepEqual(
      {
        ...store.db
          .prepare(
            "SELECT state, attempts, last_error_code AS errorCode FROM inference_jobs",
          )
          .get(),
      },
      { state: "dead", attempts: 1, errorCode: "remote_error" },
    );
  });
});
