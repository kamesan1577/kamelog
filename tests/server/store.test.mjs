import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store, Conflict } from "../../server/store.mjs";
import { backupStore, restoreBackup } from "../../server/backup.mjs";
test("persistence, revision conflicts, rollback and backup restore", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-store-"));
  let store = new Store(join(root, "source"));
  try {
    const post = store.save("posts", "fictional", {
      kind: "tweet",
      body: "fixture",
      tags: [],
    });
    assert.equal(post.revision, 1);
    assert.equal(post.views, 0);
    assert.equal(store.recordView("fictional").views, 1);
    assert.equal(store.recordView("fictional").views, 2);
    assert.equal(store.recordView("missing"), null);
    assert.throws(() => store.save("posts", "fictional", {}, 0), Conflict);
    assert.throws(() =>
      store.transaction(() => {
        store.save("settings", "temporary", { x: 1 });
        throw Error("rollback");
      }),
    );
    assert.equal(store.get("settings", "temporary"), null);
    await mkdir(join(root, "source", "media"), { recursive: true });
    await writeFile(
      join(root, "source", "media", "11111111-1111-4111-8111-111111111111.png"),
      "fictional-image",
    );
    store.save("media", "11111111-1111-4111-8111-111111111111", {
      kind: "image",
      type: "image/png",
      extension: "png",
    });
    store.createFederationIdentity({
      username: "fixture",
      publicKeyPem: "fictional-public-key",
      privateKeyPem: "fictional-private-key",
      createdAt: "2026-09-16T00:00:00.000Z",
    });
    store.saveFederationFollower({
      actorId: "https://remote.example/users/alice",
      inboxUrl: "https://remote.example/inbox",
      followActivityId: "https://remote.example/follows/1",
      followedAt: "2026-09-16T00:00:00.000Z",
    });
    store.saveFederationRemoteActor({
      actorId: "https://remote.example/users/bob",
      handle: "@bob@remote.example",
      inboxUrl: "https://remote.example/users/bob/inbox",
      preferredUsername: "bob",
      displayName: "Bob",
      fetchedAt: "2026-09-16T00:00:00.000Z",
    });
    store.saveFederationFollowing({
      actorId: "https://remote.example/users/bob",
      state: "accepted",
      followActivityId: "https://example.test/activitypub/activities/follow/1",
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:01.000Z",
    });
    store.saveFederationRemoteObject({
      objectId: "https://remote.example/notes/1",
      actorId: "https://remote.example/users/bob",
      type: "Note",
      contentHtml: "<p>backup fixture</p>",
      url: "https://remote.example/notes/1",
      publishedAt: "2026-09-16T00:00:02.000Z",
      updatedAt: "2026-09-16T00:00:02.000Z",
      attachments: [
        {
          type: "Image",
          mediaType: "image/png",
          url: "https://remote.example/media/1.png",
        },
      ],
      receivedAt: "2026-09-16T00:00:03.000Z",
    });
    store.saveFederationTimelineEntry({
      activityId: "https://remote.example/activities/create/1",
      actorId: "https://remote.example/users/bob",
      type: "Create",
      objectId: "https://remote.example/notes/1",
      publishedAt: "2026-09-16T00:00:02.000Z",
      receivedAt: "2026-09-16T00:00:03.000Z",
    });
    store.saveFederationRepost({
      objectId: "https://remote.example/notes/1",
      announceActivityId:
        "https://example.test/activitypub/activities/announce/fixture",
      createdAt: "2026-09-16T00:00:04.000Z",
    });
    store.saveFederationRemoteReaction({
      postId: "fictional",
      actorId: "https://remote.example/users/bob",
      activityId: "https://remote.example/activities/like/1",
      type: "Like",
      reactedAt: "2026-09-16T00:00:05.000Z",
    });
    store.db.prepare("DELETE FROM federation_remote_media").run();
    store.enqueueFederationActivity(
      {
        id: "https://example.test/activitypub/activities/fixture",
        type: "Create",
        objectId: "https://example.test/activitypub/objects/fixture",
        body: { type: "Create", object: { type: "Note" } },
        createdAt: "2026-09-16T00:00:00.000Z",
      },
      ["https://remote.example/inbox"],
    );
    store.close();
    store = new Store(join(root, "source"));
    assert.equal(store.get("posts", "fictional").body, "fixture");
    assert.equal(store.get("posts", "fictional").views, 2);
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM federation_remote_media")
        .get().count,
      1,
    );
    await backupStore(store, join(root, "backup"));
    await restoreBackup(join(root, "backup"), join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    assert.equal(restored.get("posts", "fictional").body, "fixture");
    assert.equal(restored.get("posts", "fictional").views, 2);
    assert.equal(
      restored.federationIdentity().privateKeyPem,
      "fictional-private-key",
    );
    assert.equal(restored.federationFollowers().length, 1);
    assert.equal(restored.federationFollowingList()[0].state, "accepted");
    assert.equal(
      restored.federationTimeline()[0].contentHtml,
      "<p>backup fixture</p>",
    );
    assert.equal(
      restored.federationPublicReposts()[0].objectId,
      "https://remote.example/notes/1",
    );
    assert.equal(restored.federationRemoteReactionCount("fictional"), 1);
    assert.equal(restored.get("posts", "fictional").likes, 1);
    assert.equal(restored.federationDiagnostics().pendingDeliveries, 1);
    assert.equal(
      await readFile(
        join(
          root,
          "restored",
          "media",
          "11111111-1111-4111-8111-111111111111.png",
        ),
        "utf8",
      ),
      "fictional-image",
    );
    restored.close();
    store.remove("posts", "fictional", 1);
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM post_views WHERE post_id=?")
        .get("fictional").count,
      0,
    );
    await assert.rejects(
      restoreBackup(join(root, "backup"), join(root, "restored")),
    );
    await writeFile(join(root, "backup", "kamelog.sqlite"), "tampered");
    await assert.rejects(
      restoreBackup(join(root, "backup"), join(root, "bad")),
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("adds view counts to an existing schema without rewriting posts", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-view-migration-"));
  try {
    const database = new DatabaseSync(join(root, "kamelog.sqlite"));
    database.exec(`
      CREATE TABLE migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE posts(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL);
      INSERT INTO migrations VALUES(1);
      INSERT INTO posts VALUES(
        'legacy-post',
        '{"kind":"tweet","title":"","body":"legacy fixture","tags":[],"date":"2026-01-01T00:00:00.000Z","likes":0}',
        1
      );
    `);
    database.close();

    const migrated = new Store(root);
    assert.equal(migrated.schemaVersion(), 10);
    assert.equal(migrated.get("posts", "legacy-post").views, 0);
    assert.equal(migrated.recordView("legacy-post").views, 1);
    assert.equal(migrated.get("posts", "legacy-post").body, "legacy fixture");
    assert.deepEqual(
      migrated.db
        .prepare("SELECT tag, source FROM post_tags WHERE post_id=?")
        .all("legacy-post"),
      [],
    );
    migrated.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("a permanently failed Follow delivery updates following state", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-follow-failure-"));
  const store = new Store(root);
  try {
    const actorId = "https://remote.example/users/alice";
    const activityId = "https://example.test/activitypub/activities/follow/1";
    store.saveFederationRemoteActor({
      actorId,
      handle: "@alice@remote.example",
      inboxUrl: `${actorId}/inbox`,
      preferredUsername: "alice",
      displayName: "Alice",
      fetchedAt: "2026-09-16T00:00:00.000Z",
    });
    store.saveFederationFollowing({
      actorId,
      state: "pending",
      followActivityId: activityId,
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
    });
    store.enqueueFederationActivity(
      {
        id: activityId,
        type: "Follow",
        objectId: actorId,
        body: { id: activityId, type: "Follow", object: actorId },
        createdAt: "2026-09-16T00:00:00.000Z",
        nextAttemptAt: 0,
      },
      [`${actorId}/inbox`],
    );
    const delivery = store.claimFederationDelivery(1);
    const result = store.failFederationDelivery(delivery.id, {
      status: 400,
      error: "HTTP 400",
      now: Date.parse("2026-09-16T00:01:00.000Z"),
    });
    assert.equal(result.dead, true);
    assert.equal(store.federationFollowing(actorId).state, "failed");
    assert.equal(store.federationFollowing(actorId).lastError, "HTTP 400");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("session expiry, single-use challenges and rate limits", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-auth-"));
  const store = new Store(root);
  try {
    const token = store.createSession();
    assert.ok(store.authenticated(token));
    store.logout(token);
    assert.ok(!store.authenticated(token));
    const c = store.challenge({ type: "login" });
    assert.equal(store.consume(c).type, "login");
    assert.equal(store.consume(c), null);
    assert.ok(store.rate("test", 1));
    assert.ok(!store.rate("test", 1));
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("authentication reset removes only access credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-reset-"));
  const store = new Store(root);
  try {
    store.save("posts", "post-1", { kind: "tweet", body: "kept" }, 0);
    store.save("credentials", "credential-1", { publicKey: "fictional" });
    const token = store.createSession();
    store.challenge({ type: "login" });
    assert.equal(store.resetAuthentication(), 1);
    assert.equal(store.authenticated(token), false);
    assert.equal(store.credentials().length, 0);
    assert.equal(store.get("posts", "post-1").body, "kept");
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
