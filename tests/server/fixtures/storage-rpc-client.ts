import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { openStore } from "../../../server/storage/provider.ts";
import { Conflict } from "../../../server/storage/local-store.ts";
import { executeCommand } from "../../../server/storage/commands.ts";
import { StorageError } from "../../../server/storage/errors.ts";

const [directory, endpoint, generation, replacement] = process.argv.slice(2);
const store = openStore(directory, {
  NODE_ENV: "test",
  KAMELOG_STORAGE_ENDPOINT: endpoint,
  KAMELOG_STORAGE_TOKEN: "fictional-storage-rpc-token-0000000000",
});
try {
  assert.equal(store.authenticated(""), false);
  assert.equal(store.schemaVersion(), 12);
  assert.deepEqual(store.get("settings", "profile"), {
    name: "架空のプロフィール",
    when: new Date("2026-01-01T00:00:00.000Z"),
    bytes: new Uint8Array([0, 127, 255]),
    count: BigInt("9007199254740993"),
    optional: undefined,
  });
  assert.equal(
    store.publicMediaReference("11111111-1111-4111-8111-111111111111"),
    true,
  );
  assert.equal(
    store.publicMediaReference("22222222-2222-4222-8222-222222222222"),
    false,
  );
  assert.deepEqual(store.sitemapPosts(), [
    { id: "fixture-blog", date: "2026-01-01T00:00:00.000Z" },
  ]);
  assert.deepEqual(store.federationLocalPosts(null, 10), []);
  assert.deepEqual(executeCommand(store, "pollFederation", [Date.now()]), {
    delivery: null,
    identity: null,
  });
  assert.equal(store.createSession(), "fictional-session");
  assert.throws(
    () => store.save("posts", "fixture", { body: "fictional" }, 1),
    Conflict,
  );
  assert.throws(
    () => store.save("drafts", "fixture", { body: "fictional" }, 1),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_limit",
  );
  assert.throws(
    () => store.authenticated("fictional-bad-session"),
    (error: unknown) => {
      assert.ok(error instanceof StorageError);
      assert.equal(error.code, "storage_unavailable");
      assert.doesNotMatch(error.message, /private/);
      return true;
    },
  );
  assert.throws(
    () => store.federationDiagnostics(),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_limit",
  );
  writeFileSync(join(directory, "storage-maintenance.json"), "{}", {
    mode: 0o600,
  });
  assert.throws(
    () => store.schemaVersion(),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_migrating",
  );
  await assert.rejects(
    store.snapshot(join(directory, "blocked-backup.sqlite")),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_migrating",
  );
  unlinkSync(join(directory, "storage-maintenance.json"));
  writeFileSync(
    join(directory, "storage.json"),
    JSON.stringify({
      version: 1,
      provider: "cloudflare",
      generation: replacement,
    }),
    { mode: 0o600 },
  );
  assert.throws(
    () => store.schemaVersion(),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_migrating",
  );
  await assert.rejects(
    store.snapshot(join(directory, "stale-backup.sqlite")),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_migrating",
  );
  assert.notEqual(generation, replacement);
  process.stdout.write("rpc-client-passed\n");
} finally {
  store.close();
}
