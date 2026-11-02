import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Store } from "../../server/storage/local-store.ts";
import {
  dispatchStorageCommand,
  executeCommand,
} from "../../server/storage/commands.ts";
import { StorageError } from "../../server/storage/errors.ts";
import { configuration, createAPI } from "../../server/api.mjs";

test("named posting command rolls back the post and tags when its durable queue fails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-command-"));
  class UnavailableQueueStore extends Store {
    enqueueInferenceJob() {
      throw new StorageError("storage_limit");
    }
  }
  const store = new UnavailableQueueStore(directory);
  try {
    store.saveInferenceSettings({ autoThreadEnabled: true });
    assert.throws(
      () =>
        executeCommand(store, "saveContent", [
          {
            table: "posts",
            id: "fixture-post",
            value: {
              kind: "tweet",
              body: "fixture",
              tags: ["fixture"],
              date: "2026-01-01T00:00:00.000Z",
            },
            config: { origin: "https://example.test" },
          },
        ]),
      (error: unknown) =>
        error instanceof StorageError && error.code === "storage_limit",
    );
    assert.equal(store.get("posts", "fixture-post"), null);
    assert.deepEqual(executeCommand(store, "manualTags", []), []);
    assert.equal(
      store.db.prepare("SELECT count(*) AS total FROM inference_jobs").get()
        ?.total,
      0,
    );
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("storage commands reject unknown names and malformed payloads before changing data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-command-"));
  const store = new Store(directory);
  try {
    for (const name of ["constructor", "__proto__", "exec", "transaction"])
      assert.throws(
        () => dispatchStorageCommand(store, name, []),
        /Unknown storage command/,
      );
    assert.throws(() =>
      dispatchStorageCommand(store, "saveContent", [
        { table: "settings", id: "profile", value: {} },
      ]),
    );
    assert.throws(() =>
      dispatchStorageCommand(store, "localLike", [
        "fixture",
        { clientId: "invalid", liked: true },
      ]),
    );
    assert.deepEqual(store.list("posts"), []);
    assert.equal(store.get("settings", "profile").name, "かめさん");
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("storage limits during posting return an actionable fixed message and no false success", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-command-"));
  class UnavailableQueueStore extends Store {
    enqueueInferenceJob() {
      throw new StorageError("storage_limit");
    }
  }
  const store = new UnavailableQueueStore(directory);
  try {
    store.saveInferenceSettings({ autoThreadEnabled: true });
    const session = store.createSession();
    const origin = "https://example.test";
    const api = createAPI(
      store,
      configuration({ KAMELOG_ORIGIN: origin, NODE_ENV: "test" }),
    );
    const response = await api(
      new Request(`${origin}/api/posts`, {
        method: "POST",
        headers: {
          origin,
          cookie: `__Host-kamelog-session=${session}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "tweet", body: "private fixture input" }),
      }),
    );
    assert.equal(response.status, 507);
    const body = await response.json();
    assert.equal(body.code, "storage_limit");
    assert.match(body.error, /利用上限/);
    assert.match(body.error, /入力内容を残/);
    assert.equal(JSON.stringify(body).includes("private fixture input"), false);
    assert.deepEqual(store.list("posts"), []);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
