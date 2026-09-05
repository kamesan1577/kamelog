import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
    assert.throws(() => store.save("posts", "fictional", {}, 0), Conflict);
    assert.throws(() =>
      store.transaction(() => {
        store.save("settings", "temporary", { x: 1 });
        throw Error("rollback");
      }),
    );
    assert.equal(store.get("settings", "temporary"), null);
    store.close();
    store = new Store(join(root, "source"));
    assert.equal(store.get("posts", "fictional").body, "fixture");
    await backupStore(store, join(root, "backup"));
    await restoreBackup(join(root, "backup"), join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    assert.equal(restored.get("posts", "fictional").body, "fixture");
    restored.close();
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
