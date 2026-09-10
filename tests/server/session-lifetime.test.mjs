import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, SESSION_TTL_SECONDS, hash } from "../../server/store.mjs";

test("owner session lasts 30 days and survives store reopen", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-session-"));
  let store = new Store(root);
  try {
    assert.equal(SESSION_TTL_SECONDS, 30 * 24 * 3600);
    const before = Date.now();
    const token = store.createSession();
    const row = store.db
      .prepare("SELECT expires FROM sessions WHERE id=?")
      .get(hash(token));
    assert.ok(row);
    assert.ok(row.expires >= before + SESSION_TTL_SECONDS * 1000);
    assert.ok(row.expires <= Date.now() + SESSION_TTL_SECONDS * 1000);
    assert.equal(store.authenticated(token), true);

    store.close();
    store = new Store(root);
    assert.equal(store.authenticated(token), true);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
