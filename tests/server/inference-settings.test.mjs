import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import { createAPI, configuration } from "../../server/api.mjs";

const encryptionKey = Buffer.alloc(32, 7).toString("base64url");

test("inference settings are owner-only and Jev credentials are encrypted at rest", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-inference-"));
  const origin = "http://localhost:3000";
  const store = new Store(root);
  const api = createAPI(
    store,
    configuration({
      KAMELOG_ORIGIN: origin,
      KAMELOG_INFERENCE_ENCRYPTION_KEY: encryptionKey,
    }),
  );
  const session = store.createSession();
  const request = (path, method = "GET", body, owner = false) =>
    api(
      new Request(origin + "/api/" + path, {
        method,
        headers: {
          origin,
          "content-type": "application/json",
          ...(owner ? { cookie: "kamelog-session=" + session } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    assert.equal((await request("inference/status")).status, 401);
    assert.deepEqual(
      await (await request("inference/status", "GET", undefined, true)).json(),
      {
        autoTagEnabled: false,
        autoThreadEnabled: false,
        tagThreshold: null,
        threadThreshold: null,
        credential: { configured: false, encryptionAvailable: true },
      },
    );
    assert.equal(
      (
        await request(
          "inference/credentials/jev",
          "POST",
          { apiKey: "fictional-api-key" },
          true,
        )
      ).status,
      201,
    );
    const persisted = store.inferenceCredential("jev");
    assert.ok(persisted);
    assert.doesNotMatch(persisted.payload, /fictional-api-key/);
    assert.deepEqual(
      await (
        await request(
          "inference/settings",
          "PUT",
          { autoThreadEnabled: true },
          true,
        )
      ).json(),
      {
        autoTagEnabled: false,
        autoThreadEnabled: true,
        tagThreshold: null,
        threadThreshold: null,
      },
    );
    assert.equal(
      (
        await request(
          "inference/settings",
          "PUT",
          { threadThreshold: 0.9 },
          true,
        )
      ).status,
      400,
    );
    const status = await (
      await request("inference/status", "GET", undefined, true)
    ).json();
    assert.equal(status.credential.configured, true);
    assert.equal("apiKey" in status, false);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("inference credentials cannot be saved without a host encryption key", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-inference-no-key-"));
  const origin = "http://localhost:3000";
  const store = new Store(root);
  const api = createAPI(store, configuration({ KAMELOG_ORIGIN: origin }));
  const session = store.createSession();
  try {
    const response = await api(
      new Request(origin + "/api/inference/credentials/jev", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: "kamelog-session=" + session,
        },
        body: JSON.stringify({ apiKey: "fictional-api-key" }),
      }),
    );
    assert.equal(response.status, 400);
    assert.equal(store.hasInferenceCredential("jev"), false);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
