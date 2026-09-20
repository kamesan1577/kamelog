import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { inferenceSecretBox } from "../../server/inference/secret.mjs";
import { saveJevCredential } from "../../server/inference/settings.mjs";
import { Store } from "../../server/store.mjs";
import { recoverStaleThreadJobs } from "../../server/thread-recovery.ts";

test("a successful publish starts inference without waiting for Jev", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-thread-dispatch-"));
  const origin = "http://localhost:3000";
  const key = randomBytes(32).toString("base64url");
  process.env.KAMELOG_DATA_DIR = directory;
  process.env.KAMELOG_ORIGIN = origin;
  process.env.KAMELOG_INFERENCE_ENCRYPTION_KEY = key;
  // One isolated runtime instance for this test file, matching the production
  // route rather than manually invoking the dispatcher.
  const { handle, getStore } = await import("../../server/runtime.mjs");
  const store = getStore();
  const box = inferenceSecretBox(key);
  assert.ok(box);
  saveJevCredential(store, box, "fictional-test-api-key");
  store.saveInferenceSettings({ autoThreadEnabled: true });
  const session = store.createSession();
  const originalFetch = globalThis.fetch;
  let completeRequest;
  let requests = 0;
  globalThis.fetch = async (_url, init) => {
    requests++;
    const payload = JSON.parse(init.body);
    assert.equal(payload.questions.parent.type, "choice");
    return new Promise((resolve) => {
      completeRequest = () =>
        resolve(
          Response.json({
            answers: {
              parent: { type: "choice", choice: payload.state.candidates[0].id },
            },
          }),
        );
    });
  };
  const publish = (body) =>
    handle(
      new Request(`${origin}/api/posts`, {
        method: "POST",
        headers: {
          origin,
          cookie: `kamelog-session=${session}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "tweet", body }),
      }),
    );
  try {
    const firstResponse = await publish("最初の投稿");
    assert.equal(firstResponse.status, 201);
    const first = await firstResponse.json();
    const secondResponse = await publish("その続き");
    assert.equal(secondResponse.status, 201);
    const second = await secondResponse.json();

    // Both requests have returned while Jev is unresolved.
    for (let i = 0; i < 100 && !completeRequest; i++) await sleep(10);
    assert.equal(requests, 1);
    assert.equal(store.get("posts", second.id).effectiveParentId, undefined);
    completeRequest();
    for (let i = 0; i < 100; i++) {
      if (store.get("posts", second.id).effectiveParentId === first.id) break;
      await sleep(10);
    }
    assert.equal(store.get("posts", second.id).effectiveParentId, first.id);
    assert.deepEqual(
      store.db
        .prepare("SELECT state FROM inference_jobs ORDER BY created_at")
        .all()
        .map((job) => job.state),
      ["succeeded", "succeeded"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    store.close();
    delete process.env.KAMELOG_DATA_DIR;
    delete process.env.KAMELOG_ORIGIN;
    delete process.env.KAMELOG_INFERENCE_ENCRYPTION_KEY;
    await rm(directory, { recursive: true, force: true });
  }
});

test("only stale processing claims are made eligible again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-thread-recovery-"));
  const store = new Store(directory);
  try {
    for (const id of ["stale", "fresh", "tag"]) {
      store.save("posts", id, {
        kind: "tweet",
        title: "",
        body: id,
        date: "2026-01-01T00:00:00.000Z",
        tags: [],
      });
      store.enqueueInferenceJob({
        task: id === "tag" ? "tag" : "thread",
        postId: id,
        inputHash: id,
        engineId: "fixture",
      });
    }
    const now = Date.now();
    store.claimInferenceJobs("thread", now);
    store.claimInferenceJobs("tag", now);
    store.db
      .prepare("UPDATE inference_jobs SET updated_at=? WHERE post_id IN ('stale','tag')")
      .run(new Date(now - 11 * 60_000).toISOString());
    assert.equal(recoverStaleThreadJobs(store, now), 1);
    assert.deepEqual(
      store.db
        .prepare("SELECT post_id, state FROM inference_jobs ORDER BY post_id")
        .all(),
      [
        { post_id: "fresh", state: "processing" },
        { post_id: "stale", state: "retry" },
        { post_id: "tag", state: "processing" },
      ],
    );
    assert.equal(store.claimInferenceJobs("thread", now).length, 1);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
