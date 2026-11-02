import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../../server/storage/local-store.ts";
import {
  LocalBlobStorage,
  type BlobStorage,
} from "../../server/storage/blobs.ts";
import { StorageError } from "../../server/storage/errors.ts";
import {
  archiveManifestHash,
  cancelMigration,
  createLocalArchive,
  exportCloudDatabase,
  GatewayMigrationTarget,
  migrateStorage,
  restoreStorageArchive,
  verifyArchive,
  type MigrationTarget,
} from "../../server/storage/migration.ts";
import type {
  ArchiveMetadata,
  StorageRow,
} from "../../server/storage/archive-format.ts";

const mediaId = "11111111-1111-4111-8111-111111111111";
const orphanId = "22222222-2222-4222-8222-222222222222";

class MemoryTarget implements MigrationTarget {
  readonly content = new Map<string, Buffer>();
  readonly rows = new Map<string, StorageRow[]>();
  readonly batches = new Map<string, string>();
  readonly blobs: BlobStorage = {
    get: async (key) => {
      const bytes = this.content.get(key);
      if (!bytes) throw new StorageError("storage_integrity");
      return Buffer.from(bytes);
    },
    put: async (key, bytes) => {
      this.content.set(key, Buffer.from(bytes));
    },
    delete: async (key) => {
      this.content.delete(key);
    },
  };
  metadata?: ArchiveMetadata;
  manifestHash?: string;
  sealed = false;
  failImport = false;
  corruptRead = false;
  afterSeal?: () => void;
  loseSealAcknowledgement = false;
  async start(
    _migrationId: string,
    metadata: ArchiveMetadata,
    manifestHash: string,
  ) {
    if (this.manifestHash && this.manifestHash !== manifestHash)
      throw new StorageError("storage_conflict");
    this.manifestHash = manifestHash;
    this.metadata = metadata;
    for (const table of metadata.tables)
      if (!this.rows.has(table.name)) this.rows.set(table.name, []);
  }
  async importRows(
    _migrationId: string,
    table: string,
    batchId: string,
    rows: StorageRow[],
  ) {
    const hash = JSON.stringify(rows);
    if (this.batches.has(batchId)) {
      assert.equal(this.batches.get(batchId), hash);
      return;
    }
    if (this.failImport && table === "posts")
      throw new StorageError("storage_limit");
    this.rows.get(table)?.push(...structuredClone(rows));
    this.batches.set(batchId, hash);
  }
  async exportRows(table: string, offset: number, limit: number) {
    const rows = structuredClone(
      this.rows.get(table)?.slice(offset, offset + limit) || [],
    );
    if (this.corruptRead && table === "posts" && rows.length)
      rows[0].data = "corrupt";
    return rows;
  }
  async seal(_migrationId: string, manifestHash: string) {
    assert.equal(this.manifestHash, manifestHash);
    this.sealed = true;
    this.afterSeal?.();
    if (this.loseSealAcknowledgement) {
      this.loseSealAcknowledgement = false;
      throw new StorageError("storage_unavailable");
    }
  }
}

async function fixture(directory: string) {
  const store = new Store(directory);
  store.save("posts", "post-fixture", {
    kind: "tweet",
    body: "fictional published data",
    tags: [],
    images: [`/api/media/${mediaId}`],
  });
  store.save("drafts", "draft-fixture", {
    kind: "tweet",
    body: "fictional private draft",
    tags: [],
  });
  store.save("credentials", "passkey-fixture", {
    publicKey: "fictional-key",
    counter: 17,
  });
  store.save("media", mediaId, {
    kind: "image",
    type: "image/png",
    extension: "png",
    size: 13,
  });
  store.createFederationIdentity({
    username: "fixture",
    publicKeyPem: "fictional-public",
    privateKeyPem: "fictional-private",
    createdAt: "2026-11-02T00:00:00.000Z",
  });
  store.db
    .prepare("INSERT INTO federation_outbound_activities VALUES(?,?,?,?,?)")
    .run(
      "activity-fixture",
      "Create",
      "post-fixture",
      "{}",
      "2026-11-02T00:00:00.000Z",
    );
  store.db
    .prepare(
      "INSERT INTO federation_deliveries(activity_id,inbox_url,state,next_attempt_at) VALUES(?,?,?,?)",
    )
    .run("activity-fixture", "https://remote.example/inbox", "pending", 0);
  store.close();
  const blobs = new LocalBlobStorage(directory);
  await blobs.put(`media/${mediaId}.png`, Buffer.from("fixture-image"));
  await blobs.put(`media/${orphanId}.png`, Buffer.from("fixture-orphan"));
}

test("one cutover copies every table, private data, key, queue and unreferenced media; archive restores locally", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    const archive = join(root, "archive");
    await fixture(source);
    const target = new MemoryTarget();
    await migrateStorage({
      source,
      backupDirectory: archive,
      target: () => target,
    });
    assert.equal(target.sealed, true);
    assert.equal(target.rows.get("drafts")?.length, 1);
    assert.equal(target.rows.get("credentials")?.length, 1);
    assert.equal(
      target.rows.get("federation_identity")?.[0].private_key_pem,
      "fictional-private",
    );
    assert.equal(target.rows.get("federation_deliveries")?.length, 1);
    assert.equal(target.content.size, 2);
    assert.equal(
      JSON.parse(await readFile(join(source, "storage.json"), "utf8")).provider,
      "cloudflare",
    );
    assert.ok((await readdir(source)).includes("kamelog.sqlite"));
    assert.ok(!(await readdir(source)).includes("storage-maintenance.json"));
    await restoreStorageArchive(archive, join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    try {
      assert.equal(
        restored.get("drafts", "draft-fixture")?.body,
        "fictional private draft",
      );
      assert.equal(
        restored.federationIdentity()?.privateKeyPem,
        "fictional-private",
      );
      assert.equal(
        restored.db
          .prepare(
            "SELECT seq FROM sqlite_sequence WHERE name='federation_deliveries'",
          )
          .get()?.seq,
        1,
      );
    } finally {
      restored.close();
    }
    assert.equal(
      (
        await readFile(join(root, "restored", `media/${orphanId}.png`))
      ).toString(),
      "fixture-orphan",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("interrupted import stays fenced and resumes without duplicate rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    const archive = join(root, "archive");
    await fixture(source);
    const target = new MemoryTarget();
    target.failImport = true;
    const options = { source, backupDirectory: archive, target: () => target };
    await assert.rejects(migrateStorage(options), { code: "storage_limit" });
    assert.ok(!(await readdir(source)).includes("storage.json"));
    assert.throws(() => new Store(source), { code: "storage_migrating" });
    const marker = await readFile(
      join(source, "storage-maintenance.json"),
      "utf8",
    );
    target.failImport = false;
    await migrateStorage(options);
    assert.equal(target.rows.get("credentials")?.length, 1);
    assert.equal(target.rows.get("posts")?.length, 1);
    assert.equal(
      JSON.parse(marker).generation,
      JSON.parse(await readFile(join(source, "storage.json"), "utf8"))
        .generation,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("failed restore never publishes a database with missing media", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-restore-publish-"));
  try {
    const source = join(root, "source");
    const archive = join(root, "archive");
    const restored = join(root, "restored");
    await fixture(source);
    await migrateStorage({
      source,
      backupDirectory: archive,
      target: () => new MemoryTarget(),
    });
    // The archive passes its streaming checksum validation; a later source read
    // can still fail due to an I/O error while copying the media.
    context.mock.method(LocalBlobStorage.prototype, "get", async () => {
      throw new StorageError("storage_unavailable");
    });
    await assert.rejects(restoreStorageArchive(archive, restored), {
      code: "storage_unavailable",
    });
    assert.deepEqual(await readdir(restored), []);
    assert.ok(
      !(await readdir(root)).some((name) =>
        name.startsWith(".restored.restore-"),
      ),
    );
  } finally {
    context.mock.restoreAll();
    await rm(root, { recursive: true, force: true });
  }
});

test("source media changed during transfer prevents cutover", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-media-race-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const target = new MemoryTarget();
    target.afterSeal = () =>
      writeFileSync(
        join(source, `media/${mediaId}.png`),
        "modified-source-file",
      );
    await assert.rejects(
      migrateStorage({
        source,
        backupDirectory: join(root, "archive"),
        target: () => target,
      }),
      { code: "storage_conflict" },
    );
    assert.ok(!(await readdir(source)).includes("storage.json"));
    assert.ok((await readdir(source)).includes("storage-maintenance.json"));
    assert.equal(
      (await readFile(join(source, `media/${mediaId}.png`))).toString(),
      "modified-source-file",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an orphan media file created during transfer is not silently omitted", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-new-media-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const target = new MemoryTarget();
    target.afterSeal = () =>
      writeFileSync(
        join(source, "media/33333333-3333-4333-8333-333333333333.png"),
        "new-orphan",
      );
    await assert.rejects(
      migrateStorage({
        source,
        backupDirectory: join(root, "archive"),
        target: () => target,
      }),
      { code: "storage_conflict" },
    );
    assert.ok(!(await readdir(source)).includes("storage.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("archive format refuses unsupported schema objects rather than dropping them", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-schema-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const database = new DatabaseSync(join(source, "kamelog.sqlite"));
    database.exec("CREATE VIEW fixture_view AS SELECT id FROM posts");
    database.close();
    const target = new MemoryTarget();
    await assert.rejects(
      migrateStorage({
        source,
        backupDirectory: join(root, "archive"),
        target: () => target,
      }),
      { code: "storage_integrity" },
    );
    assert.ok(!(await readdir(source)).includes("storage.json"));
    assert.equal(target.metadata, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("target corruption prevents cutover, and cancelling makes the unchanged source available", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const target = new MemoryTarget();
    target.corruptRead = true;
    await assert.rejects(
      migrateStorage({
        source,
        backupDirectory: join(root, "archive"),
        target: () => target,
      }),
      { code: "storage_integrity" },
    );
    assert.equal(target.sealed, false);
    assert.ok(!(await readdir(source)).includes("storage.json"));
    await cancelMigration(source);
    const original = new Store(source);
    try {
      assert.equal(
        original.get("posts", "post-fixture")?.body,
        "fictional published data",
      );
    } finally {
      original.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a writer that ignores maintenance cannot silently lose a post at cutover", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const target = new MemoryTarget();
    target.afterSeal = () => {
      const rogue = new DatabaseSync(join(source, "kamelog.sqlite"));
      try {
        rogue
          .prepare("UPDATE posts SET data=? WHERE id=?")
          .run('{"body":"newer data"}', "post-fixture");
      } finally {
        rogue.close();
      }
    };
    await assert.rejects(
      migrateStorage({
        source,
        backupDirectory: join(root, "archive"),
        target: () => target,
      }),
      { code: "storage_conflict" },
    );
    assert.ok(!(await readdir(source)).includes("storage.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampered archives and nonempty destinations are rejected without replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    const archive = join(root, "archive");
    await fixture(source);
    await migrateStorage({
      source,
      backupDirectory: archive,
      target: () => new MemoryTarget(),
    });
    await writeFile(join(archive, `media/${mediaId}.png`), "tampered");
    await assert.rejects(verifyArchive(archive), { code: "storage_integrity" });
    await assert.rejects(restoreStorageArchive(archive, source), {
      code: "storage_integrity",
    });
    assert.ok((await readdir(source)).includes("kamelog.sqlite"));
    await assert.rejects(cancelMigration(source), { code: "storage_conflict" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lost seal acknowledgement resumes the same generation and never duplicates imported rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const target = new MemoryTarget();
    target.loseSealAcknowledgement = true;
    const options = {
      source,
      backupDirectory: join(root, "archive"),
      target: () => target,
    };
    await assert.rejects(migrateStorage(options), {
      code: "storage_unavailable",
    });
    assert.equal(target.sealed, true);
    assert.ok(!(await readdir(source)).includes("storage.json"));
    await migrateStorage(options);
    assert.equal(target.rows.get("posts")?.length, 1);
    assert.equal(target.rows.get("federation_deliveries")?.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bad connection configuration never fences the original store", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-migration-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    await assert.rejects(
      migrateStorage({
        source,
        backupDirectory: join(root, "archive"),
        target: () => {
          throw new StorageError("storage_configuration");
        },
      }),
      { code: "storage_configuration" },
    );
    assert.ok(!(await readdir(source)).includes("storage-maintenance.json"));
    const original = new Store(source);
    original.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("export pages carry their own lease while staging verification remains unfenced", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const client = new GatewayMigrationTarget({
    endpoint: "https://storage.example",
    token: "fixture-token-with-at-least-thirty-two-characters",
    generation: mediaId,
    fetch: async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return Response.json({ rows: [] });
    },
  });
  await client.exportRows("posts", 0, 250);
  assert.equal(bodies[0].migrationId, undefined);
  client.setExportLease(orphanId);
  await client.exportRows("posts", 0, 250);
  assert.equal(bodies[1].migrationId, orphanId);
});

test("failed freeze preserves the original limit error when releasing an unknown lease also fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-export-"));
  const bodies: Array<{ path: string; migrationId: string }> = [];
  try {
    await assert.rejects(
      exportCloudDatabase(
        {
          endpoint: "https://storage.example",
          token: "fixture-token-with-at-least-thirty-two-characters",
          generation: mediaId,
          fetch: async (input, init) => {
            const path = new URL(String(input)).pathname;
            const body = JSON.parse(String(init?.body));
            bodies.push({ path, migrationId: body.migrationId });
            return Response.json(
              { error: "fixture" },
              { status: path.endsWith("/freeze") ? 429 : 409 },
            );
          },
        },
        join(root, "snapshot.sqlite"),
      ),
      { code: "storage_limit" },
    );
    assert.deepEqual(
      bodies.map((entry) => entry.path),
      ["/migration/freeze", "/migration/unfreeze"],
    );
    assert.equal(bodies[0].migrationId, bodies[1].migrationId);
    assert.ok(!(await readdir(root)).includes("snapshot.sqlite"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an expired export lease cannot produce a successful local database", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-export-"));
  try {
    const source = join(root, "source");
    await fixture(source);
    const metadata = await createLocalArchive(source, join(root, "archive"));
    let lease: string | undefined;
    let pageRequested = false;
    await assert.rejects(
      exportCloudDatabase(
        {
          endpoint: "https://storage.example",
          token: "fixture-token-with-at-least-thirty-two-characters",
          generation: mediaId,
          fetch: async (input, init) => {
            const path = new URL(String(input)).pathname;
            const body = JSON.parse(String(init?.body));
            if (path === "/migration/freeze") {
              lease = body.migrationId;
              return Response.json({
                ...metadata,
                manifestHash: archiveManifestHash(metadata),
                migrationId: lease,
              });
            }
            assert.equal(body.migrationId, lease);
            if (path === "/migration/export") pageRequested = true;
            return Response.json(
              { error: "expired fixture lease" },
              { status: 409 },
            );
          },
        },
        join(root, "snapshot.sqlite"),
      ),
      { code: "storage_conflict" },
    );
    assert.equal(pageRequested, true);
    assert.ok(!(await readdir(root)).includes("snapshot.sqlite"));
    assert.ok(
      !(await readdir(root)).some((name) => name.startsWith(".export-")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("historical schema indentation exports all rows and indexes while changed row content is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-historical-export-"));
  let sourceDatabase: DatabaseSync | undefined;
  try {
    const source = join(root, "source");
    await fixture(source);
    sourceDatabase = new DatabaseSync(join(source, "kamelog.sqlite"));
    // Migration 10 recreated post_tags with this indentation. A fresh schema 12
    // has identical columns/constraints, but its sqlite_schema SQL text differs.
    sourceDatabase.exec(`DROP TABLE post_tags;
            CREATE TABLE post_tags(
              post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
              tag TEXT NOT NULL,
              source TEXT NOT NULL CHECK(source IN ('manual', 'auto')),
              confidence REAL CHECK(confidence >= 0 AND confidence <= 1),
              model_version TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              training_hash TEXT NOT NULL,
              PRIMARY KEY(post_id, tag, source)
            );
            INSERT INTO post_tags VALUES('post-fixture','fictional-tag','manual',1,'manual','','');`);
    const metadata = await createLocalArchive(source, join(root, "archive"));
    let corruptRows = false;
    let lease: string | undefined;
    const options = {
      endpoint: "https://storage.example",
      token: "fixture-token-with-at-least-thirty-two-characters",
      generation: mediaId,
      fetch: (async (input, init) => {
        const path = new URL(String(input)).pathname;
        const body = JSON.parse(String(init?.body));
        if (path === "/migration/freeze") {
          lease = body.migrationId;
          return Response.json({
            ...metadata,
            manifestHash: archiveManifestHash(metadata),
            migrationId: lease,
          });
        }
        assert.equal(body.migrationId, lease);
        if (path === "/migration/unfreeze") return Response.json({ ok: true });
        assert.equal(path, "/migration/export");
        const table = metadata.tables.find(
          (entry) => entry.name === body.table,
        );
        assert.ok(table);
        const order = table.primaryKey.length
          ? table.primaryKey
          : table.columns;
        const rows = sourceDatabase!
          .prepare(
            `SELECT * FROM "${table.name}" ORDER BY ${order.map((column) => `"${column}"`).join(",")} LIMIT ? OFFSET ?`,
          )
          .all(body.limit, body.offset);
        if (corruptRows && table.name === "posts" && rows.length)
          rows[0].data = "fictional altered row";
        return Response.json({ rows });
      }) satisfies typeof fetch,
    };
    const exported = join(root, "snapshot.sqlite");
    assert.deepEqual(await exportCloudDatabase(options, exported), metadata);
    const restored = new DatabaseSync(exported, { readOnly: true });
    try {
      assert.equal(
        restored.prepare("PRAGMA integrity_check").get()?.integrity_check,
        "ok",
      );
      assert.equal(
        restored
          .prepare(
            "SELECT count(*) AS count FROM post_tags WHERE tag='fictional-tag'",
          )
          .get()?.count,
        1,
      );
      assert.equal(
        restored.prepare("SELECT count(*) AS count FROM credentials").get()
          ?.count,
        1,
      );
      assert.equal(
        restored
          .prepare("SELECT count(*) AS count FROM federation_deliveries")
          .get()?.count,
        1,
      );
      for (const index of metadata.indexes)
        assert.equal(
          restored
            .prepare(
              "SELECT count(*) AS count FROM sqlite_schema WHERE type='index' AND name=?",
            )
            .get(index.name)?.count,
          1,
        );
    } finally {
      restored.close();
    }
    corruptRows = true;
    await assert.rejects(
      exportCloudDatabase(options, join(root, "corrupt.sqlite")),
      { code: "storage_integrity" },
    );
    assert.ok(!(await readdir(root)).includes("corrupt.sqlite"));
  } finally {
    sourceDatabase?.close();
    await rm(root, { recursive: true, force: true });
  }
});
