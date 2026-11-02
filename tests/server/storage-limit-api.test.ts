import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/storage/local-store.ts";
import { StorageError } from "../../server/storage/errors.ts";
import { configuration, createAPI } from "../../server/api.mjs";
import { apiErrorMessage } from "../../lib/api-error.mjs";
import type { BlobStorage } from "../../server/storage/blobs.ts";

const origin = "http://localhost:3000";

test("post, draft and image quota failures return an actionable 507 without publishing content", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-quota-api-"));
  const store = new Store(root);
  try {
    const session = store.createSession();
    const api = createAPI(
      store,
      configuration({ NODE_ENV: "test", KAMELOG_ORIGIN: origin }),
    );
    const headers = {
      origin,
      cookie: `kamelog-session=${session}`,
      "content-type": "application/json",
    };
    const originalSave = store.save.bind(store);
    store.save = () => {
      throw new StorageError("storage_limit");
    };
    for (const collection of ["posts", "drafts"]) {
      const response = await api(
        new Request(`${origin}/api/${collection}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            kind: "tweet",
            title: "",
            body: "架空の未保存本文",
          }),
        }),
      );
      assert.equal(response.status, 507);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      const result = await response.json();
      assert.equal(result.code, "storage_limit");
      assert.match(result.error, /利用上限/);
      assert.match(result.error, /入力内容を残したまま/);
      assert.equal(
        apiErrorMessage(response.status, result.error),
        result.error,
      );
      assert.doesNotMatch(JSON.stringify(result), /架空の未保存本文/);
      assert.equal(store.list(collection).length, 0);
    }
    store.save = originalSave;
    const blobs: BlobStorage = {
      async get() {
        throw new Error("No object is expected");
      },
      async put() {
        throw new StorageError("storage_limit");
      },
      async delete() {
        throw new Error("No uploaded object is expected");
      },
    };
    Object.assign(store, { blobs });
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const response = await api(
      new Request(`${origin}/api/media?kind=image`, {
        method: "POST",
        headers: { ...headers, "content-type": "image/png" },
        body: png,
      }),
    );
    assert.equal(response.status, 507);
    assert.equal((await response.json()).code, "storage_limit");
    assert.equal(store.list("media").length, 0);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("quota exhausted during session lookup still returns the explicit storage error", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-quota-auth-"));
  const store = new Store(root);
  try {
    store.authenticated = () => {
      throw new StorageError("storage_limit");
    };
    const api = createAPI(
      store,
      configuration({ NODE_ENV: "test", KAMELOG_ORIGIN: origin }),
    );
    const response = await api(
      new Request(`${origin}/api/posts`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ kind: "tweet", body: "架空の本文" }),
      }),
    );
    assert.equal(response.status, 507);
    assert.equal((await response.json()).code, "storage_limit");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
