import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store as LocalStore } from "../../server/storage/local-store.ts";
import { LocalBlobStorage } from "../../server/storage/blobs.ts";
import {
  GatewayMigrationTarget,
  migrateStorage,
  exportCloudDatabase,
} from "../../server/storage/migration.ts";
import gateway, {
  StorageObject,
  MediaObject,
  type StorageEnvironment,
  type StorageState,
} from "../../cloudflare/storage-worker.ts";
import { Store } from "../../server/store.mjs";
import {
  DurableSqlDatabase,
  type DurableSqlValue,
} from "../../server/storage/durable-sql.ts";
import {
  canonicalMetadata,
  canonicalRow,
  type ArchiveMetadata,
  storageRowSchema,
} from "../../server/storage/archive-format.ts";

const token = "fixture-token-with-at-least-thirty-two-characters";
const digest = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

function sqlState(): StorageState & { database: DatabaseSync } {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  let depth = 0;
  return {
    database,
    storage: {
      sql: {
        exec(sql: string, ...parameters: DurableSqlValue[]) {
          const values = parameters.map((value) =>
            value instanceof ArrayBuffer ? new Uint8Array(value) : value,
          );
          if (!parameters.length && sql.includes(";")) {
            database.exec(sql);
            return Object.assign([], { rowsWritten: 0 });
          }
          const rows = database
            .prepare(sql)
            .all(...values)
            .map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key,
                  value instanceof Uint8Array
                    ? Uint8Array.from(value).buffer
                    : typeof value === "bigint"
                      ? Number(value)
                      : value,
                ]),
              ),
            );
          return Object.assign(rows, {
            rowsWritten: Number(
              database.prepare("SELECT changes() AS n").get()?.n || 0,
            ),
          });
        },
      },
      transactionSync<T>(operation: () => T): T {
        const name = `nested_${depth++}`;
        database.exec(`SAVEPOINT ${name}`);
        try {
          const result = operation();
          database.exec(`RELEASE ${name}`);
          return result;
        } catch (error) {
          database.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
          throw error;
        } finally {
          depth--;
        }
      },
      async sync() {},
    },
    async blockConcurrencyWhile<T>(operation: () => Promise<T>): Promise<T> {
      return operation();
    },
  };
}

function harness(maximum = 3_000_000_000) {
  const mediaInstances = new Map<
    string,
    { state: ReturnType<typeof sqlState>; object: MediaObject }
  >();
  const instances = new Map<
    string,
    { state: ReturnType<typeof sqlState>; object: StorageObject }
  >();
  const environment: StorageEnvironment = {
    STORAGE_TOKEN: token,
    MEDIA: {
      idFromName: (name) => name,
      get(id) {
        assert.equal(typeof id, "string");
        const name = String(id);
        let instance = mediaInstances.get(name);
        if (!instance) {
          const state = sqlState();
          instance = { state, object: new MediaObject(state, environment) };
          mediaInstances.set(name, instance);
        }
        return instance.object;
      },
    },
    MAX_STORAGE_BYTES: String(maximum),
    STORAGE: {
      idFromName: (name) => name,
      get(id) {
        assert.equal(typeof id, "string");
        const name = String(id);
        let instance = instances.get(name);
        if (!instance) {
          const state = sqlState();
          instance = { state, object: new StorageObject(state, environment) };
          instances.set(name, instance);
        }
        return instance.object;
      },
    },
  };
  function request(
    generation: string,
    path: string,
    body?: unknown,
    headers?: HeadersInit,
  ) {
    return gateway.fetch(
      new Request(`https://storage.example${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Storage-Generation": generation,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      environment,
    );
  }
  function close() {
    for (const instance of [...instances.values(), ...mediaInstances.values()])
      instance.state.database.close();
  }
  return { environment, instances, mediaInstances, request, close };
}

function fixtureArchive() {
  const state = sqlState();
  const store = new Store("fixture", new DurableSqlDatabase(state.storage));
  store.save(
    "drafts",
    "draft-fixture",
    { body: "Private fixture draft" },
    undefined,
    undefined,
  );
  store.save(
    "settings",
    "fixture",
    { secret: "fictional" },
    undefined,
    undefined,
  );
  const tables: ArchiveMetadata["tables"] = [];
  const rows = new Map<string, Record<string, string | number | null>[]>();
  for (const entry of state.database
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY rowid",
    )
    .all()) {
    const name = String(entry.name);
    const fields = state.database.prepare(`PRAGMA table_info("${name}")`).all();
    const columns = fields.map((field) => String(field.name));
    const primaryKey = fields
      .filter((field) => Number(field.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((field) => String(field.name));
    const order = primaryKey.length ? primaryKey : columns;
    const values = state.database
      .prepare(
        `SELECT * FROM "${name}" ORDER BY ${order.map((column) => `"${column}"`).join(",")}`,
      )
      .all()
      .map((row) => storageRowSchema.parse(row));
    rows.set(name, values);
    tables.push({
      name,
      columns,
      primaryKey,
      createSql: String(entry.sql),
      count: values.length,
      sha256: digest(values.map((row) => canonicalRow(columns, row)).join("")),
    });
  }
  const indexes = state.database
    .prepare(
      "SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name",
    )
    .all()
    .map((row) => ({ name: String(row.name), sql: String(row.sql) }));
  state.database.close();
  const metadata: ArchiveMetadata = {
    schemaVersion: 12,
    tables,
    indexes,
    blobs: [],
  };
  return {
    metadata,
    rows,
    manifestHash: digest(canonicalMetadata(metadata)),
    migrationId: randomUUID(),
  };
}

async function importFixture(
  system: ReturnType<typeof harness>,
  generation: string,
  fixture = fixtureArchive(),
) {
  const start = await system.request(generation, "/migration/start", {
    ...fixture.metadata,
    manifestHash: fixture.manifestHash,
    migrationId: fixture.migrationId,
  });
  assert.equal(start.status, 200, await start.text());
  for (const table of fixture.metadata.tables
    .filter((table) => table.name !== "sqlite_sequence")
    .concat(
      fixture.metadata.tables.filter(
        (table) => table.name === "sqlite_sequence",
      ),
    )) {
    const rows = fixture.rows.get(table.name) || [];
    if (rows.length) {
      const response = await system.request(generation, "/migration/import", {
        migrationId: fixture.migrationId,
        table: table.name,
        batchId: `${table.name}:0`,
        rows,
      });
      assert.equal(response.status, 200, await response.text());
    }
  }
  return fixture;
}

test("gateway keeps imported private data unavailable until verified seal, then serves named RPC", async () => {
  const system = harness(),
    generation = randomUUID();
  try {
    const fixture = await importFixture(system, generation);
    const rpc = {
      requestId: randomUUID(),
      issuedAt: Date.now(),
      method: "get",
      args: ["drafts", "draft-fixture"],
    };
    assert.equal((await system.request(generation, "/rpc", rpc)).status, 423);
    const seal = await system.request(generation, "/migration/seal", {
      migrationId: fixture.migrationId,
      manifestHash: fixture.manifestHash,
    });
    assert.equal(seal.status, 200, await seal.text());
    const response = await system.request(generation, "/rpc", rpc);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result.body, "Private fixture draft");
    // A process may stop after seal but before the local selector is renamed.
    // Replaying already-verified batches must allow that migration to resume.
    await importFixture(system, generation, fixture);
    const unauthorized = await system.request(generation, "/rpc", rpc, {
      Authorization: "Bearer wrong",
    });
    assert.equal(unauthorized.status, 401);
    assert.doesNotMatch(
      await unauthorized.text(),
      /Private fixture draft|fictional/,
    );
    assert.equal(
      (
        await system.request(generation, "/rpc", {
          ...rpc,
          method: "constructor",
        })
      ).status,
      503,
    );
  } finally {
    system.close();
  }
});

test("gateway receipts replay successful mutation once and reject stale or altered requests", async () => {
  const system = harness(),
    generation = randomUUID();
  try {
    const fixture = await importFixture(system, generation);
    await system.request(generation, "/migration/seal", {
      migrationId: fixture.migrationId,
      manifestHash: fixture.manifestHash,
    });
    const rpc = {
      requestId: randomUUID(),
      issuedAt: Date.now(),
      method: "save",
      args: ["drafts", "new-draft", { body: "one" }, 0],
    };
    const first = await system.request(generation, "/rpc", rpc);
    assert.equal(first.status, 200, await first.clone().text());
    const second = await system.request(generation, "/rpc", rpc);
    assert.deepEqual(await second.json(), await first.json());
    assert.equal(
      (
        await system.request(generation, "/rpc", {
          ...rpc,
          args: ["drafts", "new-draft", { body: "two" }, 1],
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await system.request(generation, "/rpc", {
          ...rpc,
          requestId: randomUUID(),
          issuedAt: Date.now() - 301000,
        })
      ).status,
      409,
    );
    const invalid = await system.request(generation, "/rpc", {
      ...rpc,
      requestId: randomUUID(),
      args: ["drafts", "new-draft", { body: "invalid" }, 0],
    });
    assert.equal(invalid.status, 409);
    const saved = await system.request(generation, "/rpc", {
      requestId: randomUUID(),
      issuedAt: Date.now(),
      method: "get",
      args: ["drafts", "new-draft"],
    });
    assert.equal((await saved.json()).result.body, "one");
  } finally {
    system.close();
  }
});

test("gateway refuses a tampered imported table and does not seal", async () => {
  const system = harness(),
    generation = randomUUID();
  try {
    const fixture = fixtureArchive();
    fixture.rows.get("drafts")![0].data = JSON.stringify({
      body: "tampered fixture",
    });
    await importFixture(system, generation, fixture);
    const response = await system.request(generation, "/migration/seal", {
      migrationId: fixture.migrationId,
      manifestHash: fixture.manifestHash,
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, "storage_integrity");
    assert.equal(
      (
        await system.request(generation, "/rpc", {
          requestId: randomUUID(),
          issuedAt: Date.now(),
          method: "list",
          args: ["drafts"],
        })
      ).status,
      423,
    );
  } finally {
    system.close();
  }
});

test("gateway shares blob budget across generations and never replaces immutable bytes", async () => {
  const system = harness(5),
    generation = randomUUID(),
    key = `media/${randomUUID()}.png`;
  const bytes = new Uint8Array([1, 2, 3]);
  const put = (id: string, data = bytes) =>
    gateway.fetch(
      new Request(`https://storage.example/blobs/${key}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Storage-Generation": id,
          "X-Content-SHA256": digest(data),
          "Content-Length": String(data.length),
          "Content-Type": "image/png",
        },
        body: data,
      }),
      system.environment,
    );
  try {
    const first = await put(generation);
    assert.equal(first.status, 204);
    assert.equal(first.headers.get("X-Content-SHA256"), digest(bytes));
    assert.equal((await put(generation)).status, 204);
    assert.equal(
      (await put(generation, new Uint8Array([4, 5, 6]))).status,
      409,
    );
    assert.equal((await put(randomUUID())).status, 507);
    const read = await system.request(generation, `/blobs/${key}`);
    assert.deepEqual(new Uint8Array(await read.arrayBuffer()), bytes);
    assert.equal(
      (await system.request(randomUUID(), `/blobs/${key}`)).status,
      404,
    );
    const removed = await gateway.fetch(
      new Request(`https://storage.example/blobs/${key}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Storage-Generation": generation,
        },
      }),
      system.environment,
    );
    assert.equal(removed.status, 200);
    assert.equal(
      (await system.request(generation, `/blobs/${key}`)).status,
      404,
    );
    assert.equal((await put(randomUUID())).status, 204);
  } finally {
    system.close();
  }
});

function mediaUpload(
  system: ReturnType<typeof harness>,
  generation: string,
  key: string,
  bytes: Uint8Array,
) {
  return gateway.fetch(
    new Request(`https://storage.example/blobs/${key}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Storage-Generation": generation,
        "X-Content-SHA256": digest(bytes),
        "Content-Length": String(bytes.length),
        "Content-Type": "image/png",
      },
      body: Uint8Array.from(bytes),
    }),
    system.environment,
  );
}

test("SQLite media chunks reopen byte-identically, immutable retries perform no media writes, and corruption is rejected", async () => {
  const system = harness();
  const generation = randomUUID();
  const key = `media/${randomUUID()}.png`;
  const bytes = new Uint8Array(2 * 1024 * 1024 + 19);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  try {
    assert.equal(
      (await mediaUpload(system, generation, key, bytes)).status,
      204,
    );
    const instance = system.mediaInstances.get(
      `generations/${generation}/${key}`,
    )!;
    const database = instance.state.database;
    const stored = database
      .prepare(
        "SELECT position,length(bytes) AS size FROM media_chunks ORDER BY position",
      )
      .all();
    assert.deepEqual(
      stored.map((row) => [row.position, row.size]),
      [
        [0, 1024 * 1024],
        [1, 1024 * 1024],
        [2, 19],
      ],
    );
    instance.object = new MediaObject(instance.state, system.environment);
    const changes = database
      .prepare("SELECT total_changes() AS count")
      .get()?.count;
    assert.equal(
      (await mediaUpload(system, generation, key, bytes)).status,
      204,
    );
    assert.equal(
      database.prepare("SELECT total_changes() AS count").get()?.count,
      changes,
    );
    const read = await system.request(generation, `/blobs/${key}`);
    assert.equal(read.status, 200);
    assert.deepEqual(new Uint8Array(await read.arrayBuffer()), bytes);
    database
      .prepare("UPDATE media_chunks SET bytes=? WHERE position=1")
      .run(new Uint8Array(1024 * 1024));
    const corrupt = await system.request(generation, `/blobs/${key}`);
    assert.equal(corrupt.status, 503);
    assert.equal((await corrupt.json()).error.code, "storage_integrity");
  } finally {
    system.close();
  }
});

test("SQLite media publication rolls back metadata and every chunk after a partial write failure, then retries safely", async () => {
  const system = harness();
  const generation = randomUUID();
  const key = `media/${randomUUID()}.png`;
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(23);
  try {
    // Initialize a private object without publishing any content.
    await system.request(generation, `/blobs/${key}`);
    const database = system.mediaInstances.get(
      `generations/${generation}/${key}`,
    )!.state.database;
    database.exec(
      "CREATE TRIGGER fail_chunk BEFORE INSERT ON media_chunks WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT, 'fictional interrupted write'); END",
    );
    assert.equal(
      (await mediaUpload(system, generation, key, bytes)).status,
      503,
    );
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_chunks").get()
        ?.count,
      0,
    );
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_metadata").get()
        ?.count,
      0,
    );
    assert.equal(
      (await system.request(generation, `/blobs/${key}`)).status,
      404,
    );
    database.exec("DROP TRIGGER fail_chunk");
    assert.equal(
      (await mediaUpload(system, generation, key, bytes)).status,
      204,
    );
    assert.deepEqual(
      new Uint8Array(
        await (await system.request(generation, `/blobs/${key}`)).arrayBuffer(),
      ),
      bytes,
    );
    database.prepare("DELETE FROM media_chunks WHERE position=0").run();
    assert.equal(
      (await system.request(generation, `/blobs/${key}`)).status,
      503,
    );
  } finally {
    system.close();
  }
});

test("SQLite media quota failures return storage_limit and DELETE rolls back both tables", async () => {
  const system = harness();
  const generation = randomUUID();
  const key = `media/${randomUUID()}.png`;
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(11);
  try {
    await system.request(generation, `/blobs/${key}`);
    const database = system.mediaInstances.get(
      `generations/${generation}/${key}`,
    )!.state.database;
    database.exec(
      "CREATE TRIGGER quota BEFORE INSERT ON media_chunks WHEN NEW.position=1 BEGIN SELECT RAISE(ABORT, 'SQLITE_FULL'); END",
    );
    const rejected = await mediaUpload(system, generation, key, bytes);
    assert.equal(rejected.status, 507);
    assert.equal((await rejected.json()).error.code, "storage_limit");
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_chunks").get()
        ?.count,
      0,
    );
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_metadata").get()
        ?.count,
      0,
    );
    database.exec("DROP TRIGGER quota");
    assert.equal(
      (await mediaUpload(system, generation, key, bytes)).status,
      204,
    );
    database.exec(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON media_metadata BEGIN SELECT RAISE(ABORT, 'fictional interruption'); END",
    );
    const remove = () =>
      gateway.fetch(
        new Request(`https://storage.example/blobs/${key}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Storage-Generation": generation,
          },
        }),
        system.environment,
      );
    assert.equal((await remove()).status, 503);
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_chunks").get()
        ?.count,
      2,
    );
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_metadata").get()
        ?.count,
      1,
    );
    assert.deepEqual(
      new Uint8Array(
        await (await system.request(generation, `/blobs/${key}`)).arrayBuffer(),
      ),
      bytes,
    );
    database.exec("DROP TRIGGER fail_delete");
    assert.equal((await remove()).status, 200);
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_chunks").get()
        ?.count,
      0,
    );
    assert.equal(
      database.prepare("SELECT count(*) AS count FROM media_metadata").get()
        ?.count,
      0,
    );
  } finally {
    system.close();
  }
});

test("gateway freeze blocks writes and export pagination follows primary keys", async () => {
  const system = harness(),
    generation = randomUUID();
  try {
    const fixture = await importFixture(system, generation);
    await system.request(generation, "/migration/seal", {
      migrationId: fixture.migrationId,
      manifestHash: fixture.manifestHash,
    });
    const migrationId = randomUUID();
    const frozen = await system.request(generation, "/migration/freeze", {
      migrationId,
    });
    assert.equal(frozen.status, 200, await frozen.clone().text());
    const response = await system.request(generation, "/rpc", {
      requestId: randomUUID(),
      issuedAt: Date.now(),
      method: "save",
      args: ["settings", "blocked", { value: true }],
    });
    assert.equal(response.status, 423);
    const page = await (
      await system.request(generation, "/migration/export", {
        table: "settings",
        limit: 1,
        migrationId,
      })
    ).json();
    const next = await (
      await system.request(generation, "/migration/export", {
        table: "settings",
        limit: 1,
        cursor: page.nextCursor,
        migrationId,
      })
    ).json();
    assert.notEqual(page.rows[0].id, next.rows[0].id);
    assert.equal(
      (
        await system.request(generation, "/migration/unfreeze", {
          migrationId: randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (await system.request(generation, "/migration/unfreeze", { migrationId }))
        .status,
      200,
    );
  } finally {
    system.close();
  }
});

test("expired export lease releases writes and cannot unlock or renew a later export", async () => {
  const system = harness(),
    generation = randomUUID();
  try {
    const fixture = await importFixture(system, generation);
    await system.request(generation, "/migration/seal", {
      migrationId: fixture.migrationId,
      manifestHash: fixture.manifestHash,
    });
    const orphanKey = `media/${randomUUID()}.png`;
    const orphanBytes = new Uint8Array([1, 2, 3]);
    assert.equal(
      (
        await gateway.fetch(
          new Request(`https://storage.example/blobs/${orphanKey}`, {
            method: "PUT",
            body: orphanBytes,
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Storage-Generation": generation,
              "X-Content-SHA256": digest(orphanBytes),
              "Content-Length": "3",
              "Content-Type": "image/png",
            },
          }),
          system.environment,
        )
      ).status,
      204,
    );
    const deleteOrphan = () =>
      gateway.fetch(
        new Request(`https://storage.example/blobs/${orphanKey}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Storage-Generation": generation,
          },
        }),
        system.environment,
      );
    const firstOwner = randomUUID();
    assert.equal(
      (
        await system.request(generation, "/migration/freeze", {
          migrationId: firstOwner,
        })
      ).status,
      200,
    );
    const write = () =>
      system.request(generation, "/rpc", {
        requestId: randomUUID(),
        issuedAt: Date.now(),
        method: "save",
        args: ["settings", "after-expiry", { value: true }],
      });
    assert.equal((await write()).status, 423);
    assert.equal((await deleteOrphan()).status, 423);
    const database = system.instances.get(generation)!.state.database;
    // Simulate the exporter being killed and five minutes elapsing. The server
    // lease, rather than a client cleanup handler, must make publishing recover.
    database
      .prepare("UPDATE _storage_meta SET value=? WHERE id='frozenUntil'")
      .run(String(Date.now() - 1));
    assert.equal((await write()).status, 200);
    assert.equal((await deleteOrphan()).status, 200);
    assert.equal(
      (
        await system.request(generation, "/migration/export", {
          table: "settings",
          migrationId: firstOwner,
        })
      ).status,
      409,
    );
    const secondOwner = randomUUID();
    assert.equal(
      (
        await system.request(generation, "/migration/freeze", {
          migrationId: secondOwner,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await system.request(generation, "/migration/unfreeze", {
          migrationId: firstOwner,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await system.request(generation, "/migration/export", {
          table: "settings",
          migrationId: firstOwner,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await system.request(generation, "/migration/export", {
          table: "settings",
        })
      ).status,
      423,
    );
    database
      .prepare("UPDATE _storage_meta SET value=? WHERE id='frozenUntil'")
      .run(String(Date.now() + 1000));
    assert.equal(
      (
        await system.request(generation, "/migration/export", {
          table: "settings",
          migrationId: secondOwner,
        })
      ).status,
      200,
    );
    assert.ok(
      Number(
        database
          .prepare("SELECT value FROM _storage_meta WHERE id='frozenUntil'")
          .get()?.value,
      ) >
        Date.now() + 290_000,
    );
    assert.equal((await write()).status, 423);
    assert.equal(
      (
        await system.request(generation, "/migration/unfreeze", {
          migrationId: secondOwner,
        })
      ).status,
      200,
    );
    assert.equal((await write()).status, 200);
  } finally {
    system.close();
  }
});

test("real migration client cuts over once and exports current cloud data back to portable SQLite", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-gateway-"));
  const source = join(root, "source");
  const system = harness();
  const local = new LocalStore(source);
  const mediaId = randomUUID();
  const bytes = Buffer.from("fictional image fixture");
  local.save(
    "drafts",
    "private-draft",
    { body: "keep this draft", images: [`/api/media/${mediaId}`] },
    undefined,
    undefined,
  );
  local.save(
    "media",
    mediaId,
    { kind: "image", type: "image/png", extension: "png", size: bytes.length },
    undefined,
    undefined,
  );
  local.save(
    "credentials",
    "fixture-credential",
    { publicKey: "fixture-public-key", counter: 7 },
    undefined,
    undefined,
  );
  const session = local.createSession();
  local.db
    .prepare("INSERT INTO federation_outbound_activities VALUES(?,?,?,?,?)")
    .run(
      "fixture-activity",
      "Create",
      "fixture-object",
      "{}",
      "2026-11-02T00:00:00.000Z",
    );
  local.db
    .prepare(
      "INSERT INTO federation_deliveries(id,activity_id,inbox_url,state,next_attempt_at) VALUES(137,?,?,?,?)",
    )
    .run("fixture-activity", "https://remote.example/inbox", "pending", 0);
  local.db.prepare("DELETE FROM federation_deliveries").run();
  await new LocalBlobStorage(source).put(`media/${mediaId}.png`, bytes);
  local.close();
  const transport: typeof fetch = async (input, init) =>
    gateway.fetch(new Request(input, init), system.environment);
  try {
    const result = await migrateStorage({
      source,
      backupDirectory: join(root, "backup"),
      target: (generation) =>
        new GatewayMigrationTarget({
          endpoint: "https://storage.example",
          token,
          generation,
          fetch: transport,
        }),
    });
    const selector = JSON.parse(
      await readFile(join(source, "storage.json"), "utf8"),
    );
    assert.equal(selector.provider, "cloudflare");
    assert.equal(selector.generation, result.generation);
    const refusedDelete = await gateway.fetch(
      new Request(`https://storage.example/blobs/media/${mediaId}.png`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Storage-Generation": result.generation,
        },
      }),
      system.environment,
    );
    assert.equal(refusedDelete.status, 409);
    const saved = await system.request(result.generation, "/rpc", {
      requestId: randomUUID(),
      issuedAt: Date.now(),
      method: "save",
      args: ["drafts", "after-cutover", { body: "new cloud-only draft" }, 0],
    });
    assert.equal(saved.status, 200, await saved.clone().text());
    const exported = join(root, "exported.sqlite");
    await exportCloudDatabase(
      {
        endpoint: "https://storage.example",
        token,
        generation: result.generation,
        fetch: transport,
      },
      exported,
    );
    const restored = new DatabaseSync(exported);
    try {
      assert.equal(
        restored.prepare("SELECT COUNT(*) AS count FROM drafts").get()?.count,
        2,
      );
      assert.match(
        String(
          restored
            .prepare(
              "SELECT data FROM credentials WHERE id='fixture-credential'",
            )
            .get()?.data,
        ),
        /fixture-public-key/,
      );
      assert.equal(
        restored
          .prepare(
            "SELECT seq FROM sqlite_sequence WHERE name='federation_deliveries'",
          )
          .get()?.seq,
        137,
      );
      assert.equal(
        restored.prepare("PRAGMA integrity_check").get()?.integrity_check,
        "ok",
      );
      assert.equal(
        restored
          .prepare("SELECT COUNT(*) AS count FROM sessions WHERE id=?")
          .get(digest(session))?.count,
        1,
      );
    } finally {
      restored.close();
    }
    const old = new DatabaseSync(join(source, "kamelog.sqlite"));
    try {
      assert.equal(
        old.prepare("SELECT COUNT(*) AS count FROM drafts").get()?.count,
        1,
      );
    } finally {
      old.close();
    }
  } finally {
    system.close();
    await rm(root, { recursive: true, force: true });
  }
});
