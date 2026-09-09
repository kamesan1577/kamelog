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
    store.close();
    store = new Store(join(root, "source"));
    assert.equal(store.get("posts", "fictional").body, "fixture");
    assert.equal(store.get("posts", "fictional").views, 2);
    await backupStore(store, join(root, "backup"));
    await restoreBackup(join(root, "backup"), join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    assert.equal(restored.get("posts", "fictional").body, "fixture");
    assert.equal(restored.get("posts", "fictional").views, 2);
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
    assert.equal(migrated.schemaVersion(), 2);
    assert.equal(migrated.get("posts", "legacy-post").views, 0);
    assert.equal(migrated.recordView("legacy-post").views, 1);
    assert.equal(migrated.get("posts", "legacy-post").body, "legacy fixture");
    migrated.close();
  } finally {
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
