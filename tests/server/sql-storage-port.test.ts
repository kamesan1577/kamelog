import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StorageError } from "../../server/storage/errors.ts";
import { Store as DomainStore } from "../../server/store.mjs";
import {
  Conflict,
  LocalSqlDatabase,
  Store,
} from "../../server/storage/local-store.ts";

test("the domain store uses the injected engine's atomic transaction", () => {
  const database = new LocalSqlDatabase(":memory:");
  const store = new DomainStore("unused", database);
  try {
    const saved = store.save("posts", "fixture", {
      kind: "tweet",
      body: "Published fixture",
      tags: ["example"],
    });
    assert.equal(saved.revision, 1);
    assert.throws(
      () => store.save("posts", "fixture", { kind: "tweet", body: "stale" }, 0),
      Conflict,
    );
    assert.throws(() =>
      store.save(
        "posts",
        "fixture",
        { kind: "tweet", body: "must roll back", tags: [] },
        1,
        () => {
          store.save("settings", "side-effect", { changed: true });
          throw new Error("fixture failure");
        },
      ),
    );
    assert.equal(store.get("posts", "fixture").body, "Published fixture");
    assert.equal(store.get("settings", "side-effect"), null);
    assert.deepEqual(store.get("posts", "fixture").tags, ["example"]);
    store.save("drafts", "private-fixture", {
      kind: "tweet",
      body: "Private fixture",
      tags: [],
    });
    assert.equal(store.list("posts").length, 1);
    assert.equal(store.list("drafts").length, 1);
  } finally {
    store.close();
  }
});

test("the local provider reopens and snapshots all committed data", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-sql-port-"));
  let store = new Store(join(root, "source"));
  try {
    store.save("settings", "fixture", { version: 1 });
    await store.snapshot(join(root, "snapshot.sqlite"));
    store.close();
    store = new Store(join(root, "source"));
    assert.deepEqual(store.get("settings", "fixture"), {
      id: "fixture",
      version: 1,
    });
    const snapshot = new LocalSqlDatabase(join(root, "snapshot.sqlite"));
    try {
      assert.equal(
        snapshot.prepare("PRAGMA integrity_check").get()?.integrity_check,
        "ok",
      );
      assert.equal(
        snapshot.prepare("SELECT data FROM settings WHERE id=?").get("fixture")
          ?.data,
        '{"version":1}',
      );
    } finally {
      snapshot.close();
    }
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("an async callback cannot silently commit a local transaction early", () => {
  const database = new LocalSqlDatabase(":memory:");
  try {
    database.exec("CREATE TABLE fixture(id INTEGER PRIMARY KEY)");
    assert.throws(
      () =>
        database.transaction(() => {
          database.prepare("INSERT INTO fixture VALUES(1)").run();
          return Promise.resolve();
        }),
      /must be synchronous/,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM fixture").get()?.count,
      0,
    );
  } finally {
    database.close();
  }
});

test("opening a verified remote schema does not rescan posts or bootstrap writes", (context) => {
  const database = new LocalSqlDatabase(":memory:");
  const initial = new DomainStore("fixture", database);
  initial.save("posts", "preserved", {
    kind: "tweet",
    body: "fixture",
    tags: [],
  });
  const queries: string[] = [];
  const prepare = database.prepare;
  context.mock.method(database, "prepare", (sql: string) => {
    queries.push(sql);
    return prepare.call(database, sql);
  });
  context.mock.method(database, "exec", () => {
    throw new Error("Verified schemas must not run bootstrap SQL");
  });
  try {
    const reopened = new DomainStore("cloudflare", database, {
      initialize: false,
    });
    assert.deepEqual(queries, [
      "SELECT MAX(version) AS version FROM migrations",
    ]);
    assert.equal(reopened.get("posts", "preserved").body, "fixture");
  } finally {
    context.mock.restoreAll();
    database.close();
  }
});

test("skipping initialization rejects an unexpected schema without altering it", () => {
  const database = new LocalSqlDatabase(":memory:");
  try {
    database.exec(
      "CREATE TABLE migrations(version INTEGER PRIMARY KEY); INSERT INTO migrations VALUES(11)",
    );
    assert.throws(
      () => new DomainStore("cloudflare", database, { initialize: false }),
      /Unsupported storage schema/,
    );
    assert.equal(
      database.prepare("SELECT MAX(version) AS version FROM migrations").get()
        ?.version,
      11,
    );
    assert.equal(
      database
        .prepare("SELECT name FROM sqlite_schema WHERE name='posts'")
        .get(),
      undefined,
    );
  } finally {
    database.close();
  }
});

test("maintenance fences open stores, prepared statements and new connections", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-storage-fence-"));
  const store = new Store(root);
  const prepared = store.db.prepare("INSERT INTO settings VALUES(?, ?)");
  try {
    store.save("settings", "fixture", { version: 1 });
    await writeFile(join(root, "storage-maintenance.json"), "{}");
    const migrating = (error: unknown) =>
      error instanceof StorageError && error.code === "storage_migrating";
    assert.throws(
      () => store.save("settings", "fixture", { version: 2 }),
      migrating,
    );
    assert.throws(() => prepared.run("unexpected", "{}"), migrating);
    assert.throws(() => store.get("settings", "fixture"), migrating);
    assert.throws(() => new Store(root), migrating);
    const migration = new Store(root, { maintenanceBypass: true });
    try {
      assert.equal(migration.get("settings", "fixture").version, 1);
      assert.equal(migration.get("settings", "unexpected"), null);
      await migration.snapshot(join(root, "fixture-snapshot.sqlite"));
    } finally {
      migration.close();
    }
    await rm(join(root, "storage-maintenance.json"));
    await writeFile(join(root, "storage.json"), '{"provider":"cloudflare"}');
    const changed = (error: unknown) =>
      error instanceof StorageError && error.code === "storage_configuration";
    assert.throws(
      () => store.save("settings", "fixture", { version: 3 }),
      changed,
    );
    assert.throws(() => prepared.run("unexpected", "{}"), changed);
    assert.throws(() => new Store(root), changed);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a fence appearing before commit rolls back the entire pending transaction", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-storage-commit-fence-"));
  let fenced = false;
  const database = new LocalSqlDatabase(join(root, "fixture.sqlite"), () => {
    if (fenced) throw new StorageError("storage_migrating");
  });
  try {
    database.exec("CREATE TABLE fixture(id INTEGER PRIMARY KEY)");
    assert.throws(
      () =>
        database.transaction(() => {
          database.prepare("INSERT INTO fixture VALUES(1)").run();
          fenced = true;
        }),
      (error: unknown) =>
        error instanceof StorageError && error.code === "storage_migrating",
    );
    fenced = false;
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM fixture").get()?.count,
      0,
    );
  } finally {
    database.close();
    await rm(root, { recursive: true, force: true });
  }
});
