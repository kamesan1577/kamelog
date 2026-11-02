import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageError } from "../../server/storage/errors.ts";
import { runFederationWorker } from "../../server/federation-worker.mjs";
import { setImmediate } from "node:timers/promises";
import { Store as DomainStore } from "../../server/store.mjs";
import { PUBLIC_METHODS } from "../../server/storage/protocol.ts";

test("the remote repository exposes every domain operation and excludes local-only handles", () => {
  const localOnly = new Set([
    "constructor",
    "transaction",
    "table",
    "snapshot",
    "close",
  ]);
  const expected = Object.getOwnPropertyNames(DomainStore.prototype)
    .filter((name) => !localOnly.has(name))
    .sort();
  assert.deepEqual([...PUBLIC_METHODS].sort(), expected);
});

test("a quota failure in post-commit dispatch cannot turn a saved post into a failed response", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-runtime-commit-"));
  const previousDirectory = process.env.KAMELOG_DATA_DIR;
  const previousOrigin = process.env.KAMELOG_ORIGIN;
  process.env.KAMELOG_DATA_DIR = directory;
  process.env.KAMELOG_ORIGIN = "http://localhost:3000";
  const runtime = await import(
    new URL(
      "../../server/runtime.mjs?storage-commit-regression",
      import.meta.url,
    ).href
  );
  const store = runtime.getStore();
  try {
    const session = store.createSession();
    let settingsReads = 0;
    store.inferenceSettings = () => {
      settingsReads++;
      if (settingsReads > 1) throw new StorageError("storage_limit");
      return { autoThreadEnabled: false };
    };
    const response = await runtime.handle(
      new Request("http://localhost:3000/api/posts", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          cookie: `kamelog-session=${session}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ kind: "tweet", body: "架空の保存済み投稿" }),
      }),
    );
    assert.equal(response.status, 201);
    assert.equal((await response.json()).body, "架空の保存済み投稿");
    assert.equal(store.list("posts").length, 1);
    assert.equal(settingsReads, 2);
  } finally {
    store.close();
    if (previousDirectory === undefined) delete process.env.KAMELOG_DATA_DIR;
    else process.env.KAMELOG_DATA_DIR = previousDirectory;
    if (previousOrigin === undefined) delete process.env.KAMELOG_ORIGIN;
    else process.env.KAMELOG_ORIGIN = previousOrigin;
    await rm(directory, { recursive: true, force: true });
  }
});

test("an idle cloud federation worker keeps its poll rate within the free request budget", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController();
  let heartbeats = 0;
  let claims = 0;
  const store = {
    provider: "cloudflare",
    heartbeatFederationWorker() {
      heartbeats++;
    },
    claimFederationDelivery() {
      claims++;
      return null;
    },
  };
  const running = runFederationWorker(
    store,
    { origin: "https://example.test" },
    {
      signal: controller.signal,
    },
  );
  await setImmediate();
  assert.equal(heartbeats, 1);
  context.mock.timers.tick(14_999);
  await setImmediate();
  assert.equal(heartbeats, 1);
  context.mock.timers.tick(1);
  await setImmediate();
  assert.equal(heartbeats, 2);
  assert.equal(claims, 2);
  controller.abort();
  context.mock.timers.tick(15_000);
  await running;
});
