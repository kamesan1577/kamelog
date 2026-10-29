import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Store } from "../../server/store.mjs";
import { createAPI, configuration } from "../../server/api.mjs";
import { backupStore, restoreBackup } from "../../server/backup.mjs";

const origin = "http://localhost:3000";
test("anonymous local likes persist, deduplicate, and remain separate from remote likes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-likes-"));
  let store = new Store(join(root, "source"));
  let api = createAPI(
    store,
    configuration({ KAMELOG_ORIGIN: origin, NODE_ENV: "test" }),
  );
  const clientId = randomUUID();
  const otherClientId = randomUUID();
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    headers = {},
  ) =>
    api(
      new Request(`${origin}/api/${path}`, {
        method,
        headers: { origin, "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const like = (liked: boolean, visitor = clientId) =>
    request("posts/fixture/like", "POST", { clientId: visitor, liked });
  try {
    store.save("posts", "fixture", {
      kind: "blog",
      title: "Fixture",
      body: "Body",
      tags: [],
      date: "2026-01-01T00:00:00.000Z",
      likes: 3,
    });
    store.saveFederationRemoteActor({
      actorId: "https://remote.example/actor",
      handle: "@fixture@remote.example",
      inboxUrl: "https://remote.example/inbox",
      preferredUsername: "fixture",
      displayName: "Fixture",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
    store.saveFederationRemoteReaction({
      postId: "fixture",
      actorId: "https://remote.example/actor",
      activityId: "https://remote.example/like",
      type: "Like",
      reactedAt: "2026-01-01T00:00:00.000Z",
    });
    const added = await like(true);
    assert.equal(added.status, 200);
    assert.equal((await added.json()).likes, 5);
    assert.equal((await (await like(true)).json()).likes, 5);
    assert.equal((await (await like(true, otherClientId)).json()).likes, 6);
    assert.equal((await (await request("posts/fixture")).json()).likes, 6);
    assert.equal((await (await request("posts")).json())[0].likes, 6);
    assert.equal(store.get("posts", "fixture").revision, 1);
    assert.equal(store.get("posts", "fixture").updatedAt, undefined);
    const staleEditorPost = store.get("posts", "fixture");
    await like(true, "11111111-1111-4111-8111-111111111111");
    store.save("posts", "fixture", { ...staleEditorPost, likes: 5 }, 1);
    assert.equal(store.get("posts", "fixture").likes, 7);
    await like(false, "11111111-1111-4111-8111-111111111111");
    const session = store.createSession();
    const edit = await request(
      "posts/fixture",
      "PUT",
      { kind: "blog", title: "Edited", body: "Body", revision: 2 },
      { cookie: `kamelog-session=${session}` },
    );
    assert.equal(edit.status, 200);
    assert.equal((await edit.json()).likes, 6);
    assert.equal(store.localPostLikes("fixture"), 5);
    store.db.exec(`CREATE TRIGGER fail_like BEFORE UPDATE OF data ON posts
      BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;`);
    const failedClient = randomUUID();
    assert.equal((await like(true, failedClient)).status, 400);
    assert.equal(store.get("posts", "fixture").likes, 6);
    store.db.exec("DROP TRIGGER fail_like");
    assert.equal((await (await like(true, failedClient)).json()).likes, 7);
    assert.equal((await (await like(false, failedClient)).json()).likes, 6);
    store.close();
    store = new Store(join(root, "source"));
    api = createAPI(
      store,
      configuration({ KAMELOG_ORIGIN: origin, NODE_ENV: "test" }),
    );
    assert.equal((await (await like(true)).json()).likes, 6);
    await backupStore(store, join(root, "backup"));
    await restoreBackup(join(root, "backup"), join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    try {
      const restoredAPI = createAPI(
        restored,
        configuration({ KAMELOG_ORIGIN: origin, NODE_ENV: "test" }),
      );
      const res = await restoredAPI(
        new Request(`${origin}/api/posts/fixture/like`, {
          method: "POST",
          headers: { origin },
          body: JSON.stringify({ clientId, liked: true }),
        }),
      );
      assert.equal((await res.json()).likes, 6);
    } finally {
      restored.close();
    }
    assert.equal((await (await like(false)).json()).likes, 5);
    assert.equal((await (await like(false)).json()).likes, 5);
    assert.equal((await (await like(false, randomUUID())).json()).likes, 5);
    assert.equal((await (await like(false, otherClientId)).json()).likes, 4);
    assert.equal(store.federationRemoteReactionCount("fixture"), 1);
    assert.equal(store.localPostLikes("fixture"), 3);
    const publicBody = JSON.stringify(await (await request("posts")).json());
    assert.ok(!publicBody.includes(clientId));
    assert.ok(!publicBody.includes("client_hash"));
    await like(true);
    store.remove("posts", "fixture", 3);
    store.save("posts", "fixture", {
      kind: "tweet",
      body: "Recreated",
      tags: [],
      likes: 0,
    });
    assert.equal((await (await like(true)).json()).likes, 1);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("local likes enforce Origin, validation, public post existence and an isolated rate limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-likes-boundary-"));
  const store = new Store(root);
  const api = createAPI(
    store,
    configuration({ KAMELOG_ORIGIN: origin, NODE_ENV: "test" }),
  );
  const payload = { clientId: randomUUID(), liked: true };
  const send = (
    body: unknown = payload,
    requestOrigin: string | null = origin,
    id = "fixture",
  ) =>
    api(
      new Request(`${origin}/api/posts/${id}/like`, {
        method: "POST",
        headers: requestOrigin ? { origin: requestOrigin } : {},
        body: JSON.stringify(body),
      }),
    );
  try {
    store.save("posts", "fixture", {
      kind: "tweet",
      body: "Fixture",
      tags: [],
      likes: 0,
    });
    store.save("drafts", "draft", {
      kind: "tweet",
      body: "Private fixture",
      tags: [],
    });
    assert.equal((await send(payload, "https://other.example")).status, 403);
    assert.equal((await send(payload, null)).status, 403);
    for (const body of [
      {},
      { ...payload, clientId: "invalid" },
      { ...payload, liked: 1 },
      { ...payload, likes: 500 },
    ])
      assert.equal((await send(body)).status, 400);
    assert.equal((await send(payload, origin, "missing")).status, 404);
    assert.equal((await send(payload, origin, "draft")).status, 404);
    assert.equal(store.get("posts", "fixture").likes, 0);
    for (let i = 0; i < 120; i++) store.rate("write-global", 120);
    assert.equal((await send()).status, 200);
    for (let i = 0; i < 600; i++) store.rate("like-global", 600);
    assert.equal((await send()).status, 429);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("existing databases gain local likes without changing legacy counts", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-likes-upgrade-"));
  let store = new Store(root);
  try {
    store.save("posts", "legacy", {
      kind: "tweet",
      body: "Legacy fixture",
      tags: [],
      likes: 4,
    });
    store.db.exec(
      "DROP TABLE local_post_likes; DELETE FROM migrations WHERE version=12",
    );
    store.close();
    store = new Store(root);
    assert.equal(store.schemaVersion(), 12);
    assert.equal(store.get("posts", "legacy").likes, 4);
    const api = createAPI(
      store,
      configuration({ KAMELOG_ORIGIN: origin, NODE_ENV: "test" }),
    );
    const clientId = randomUUID();
    const res = await api(
      new Request(`${origin}/api/posts/legacy/like`, {
        method: "POST",
        headers: { origin },
        body: JSON.stringify({ clientId, liked: true }),
      }),
    );
    assert.equal((await res.json()).likes, 5);
    const row = store.db
      .prepare(
        "SELECT client_hash FROM local_post_likes WHERE post_id='legacy'",
      )
      .get();
    assert.ok(row);
    assert.notEqual(row.client_hash, clientId);
    assert.match(String(row.client_hash), /^[a-f0-9]{64}$/);
    store.close();
    store = new Store(root);
    assert.equal(store.get("posts", "legacy").likes, 5);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
