import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Store, Conflict } from "../server/store.mjs";
import {
  dispatchStorageCommand,
  readOnlyStorageCommands,
} from "../server/storage/commands.ts";
import {
  decodeWire,
  encodeWire,
  generationSchema,
  PUBLIC_METHODS,
  READ_METHODS,
} from "../server/storage/protocol.ts";
import { StorageError } from "../server/storage/errors.ts";
import { DurableSqlDatabase } from "../server/storage/durable-sql.ts";
import type { DurableSqlStorage } from "../server/storage/durable-sql.ts";
import {
  archiveMetadataSchema,
  canonicalMetadata,
  canonicalRow,
  storageRowSchema,
  type ArchiveMetadata,
  type TableDescription,
} from "../server/storage/archive-format.ts";

interface ObjectBody {
  size: number;
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface PrivateBucket {
  get(key: string): Promise<ObjectBody | null>;
  head(key: string): Promise<Omit<ObjectBody, "arrayBuffer"> | null>;
  put(
    key: string,
    value: ArrayBuffer,
    options: {
      customMetadata: Record<string, string>;
      httpMetadata: { contentType: string };
      sha256: string;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}
export interface StorageState {
  storage: DurableSqlStorage & { sync(): Promise<void> };
  blockConcurrencyWhile<T>(operation: () => Promise<T>): Promise<T>;
}
interface ObjectStub {
  fetch(request: Request): Promise<Response>;
}
export interface StorageEnvironment {
  STORAGE_TOKEN: string;
  STORAGE: {
    idFromName(name: string): unknown;
    get(id: unknown): ObjectStub;
  };
  MEDIA: PrivateBucket;
  MAX_STORAGE_BYTES?: string;
}

const objectKey = /^media\/[a-f0-9-]{36}\.(mp4|png|jpg|webp|gif)$/;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const digestPattern = /^[a-f0-9]{64}$/;
const exportLeaseMs = 5 * 60_000;
const rpcSchema = z
  .object({
    requestId: z.uuid(),
    issuedAt: z.number().int().positive(),
    method: z.string().max(100),
    args: z.array(z.unknown()).max(12),
  })
  .strict();
const jsonHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: jsonHeaders });
}

function sha256(value: string | ArrayBuffer): string {
  return createHash("sha256")
    .update(typeof value === "string" ? value : new Uint8Array(value))
    .digest("hex");
}

function quoted(name: string): string {
  if (!identifier.test(name)) throw new StorageError("storage_integrity");
  return `"${name}"`;
}

function authorized(request: Request, token: string): boolean {
  if (token.length < 32) return false;
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const actual = createHash("sha256")
    .update(request.headers.get("Authorization") || "")
    .digest();
  return timingSafeEqual(expected, actual);
}

async function boundedJSON(
  request: Request,
  maximum = 1_048_576,
): Promise<unknown> {
  const length = Number(request.headers.get("Content-Length"));
  if (length > maximum) throw new StorageError("storage_limit");
  if (!request.body) throw new StorageError("storage_integrity");
  const reader = request.body.getReader();
  let total = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new StorageError("storage_limit");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function storageFailure(error: unknown): Response {
  if (error instanceof Conflict)
    return json(
      { ok: false, error: { code: "conflict", name: "Conflict" } },
      409,
    );
  if (error instanceof StorageError)
    return json(
      { ok: false, error: { code: error.code } },
      error.code === "storage_limit"
        ? 507
        : error.code === "storage_conflict"
          ? 409
          : error.code === "storage_migrating"
            ? 423
            : 503,
    );
  if (
    error instanceof z.ZodError ||
    error instanceof SyntaxError ||
    error instanceof TypeError
  )
    return json({ ok: false, error: { code: "invalid_input" } }, 400);
  // Provider diagnostics are classified here, never copied into the response.
  const message = error instanceof Error ? error.message : "";
  if (
    /quota|limit exceeded|database or disk is full|SQLITE_FULL|exceeded.*(?:read|write|storage)|too many.*(?:read|write|request)/i.test(
      message,
    )
  )
    return json({ ok: false, error: { code: "storage_limit" } }, 507);
  return json({ ok: false, error: { code: "storage_unavailable" } }, 503);
}

/** All DB callbacks execute inside this object, beside authoritative SQLite. */
export class StorageObject {
  readonly state: StorageState;
  readonly env: StorageEnvironment;
  readonly db: DurableSqlDatabase;
  private store?: Store;
  private buildingArchive = false;

  constructor(state: StorageState, env: StorageEnvironment) {
    this.state = state;
    this.env = env;
    this.db = new DurableSqlDatabase(state.storage);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _storage_meta(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _storage_receipts(id TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS _storage_receipts_age ON _storage_receipts(created_at);
      CREATE TABLE IF NOT EXISTS _storage_imports(id TEXT PRIMARY KEY, hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _storage_blobs(key TEXT PRIMARY KEY, size INTEGER NOT NULL, sha256 TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _storage_blob_total(id INTEGER PRIMARY KEY CHECK(id=1), size INTEGER NOT NULL CHECK(size>=0));
      CREATE TABLE IF NOT EXISTS _storage_archive_tables(position INTEGER PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _storage_archive_indexes(position INTEGER PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _storage_archive_blobs(position INTEGER PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS _storage_verified_blobs(key TEXT PRIMARY KEY, size INTEGER NOT NULL, sha256 TEXT NOT NULL, content_type TEXT NOT NULL);
      INSERT OR IGNORE INTO _storage_blob_total VALUES(1,0);
    `);
  }

  private meta(id: string): string | undefined {
    const value = this.db
      .prepare("SELECT value FROM _storage_meta WHERE id=?")
      .get(id)?.value;
    return typeof value === "string" ? value : undefined;
  }

  private setMeta(id: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO _storage_meta VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(id, value);
  }

  private exportLeaseOwner(now = Date.now()): string | undefined {
    const owner = this.meta("frozen");
    const expires = Number(this.meta("frozenUntil"));
    // A crashed exporter cannot indefinitely disable publishing. Missing legacy
    // expiry metadata is also expired; a fresh export must acquire its own lease.
    return owner && Number.isSafeInteger(expires) && expires > now
      ? owner
      : undefined;
  }

  private renewExportLease(owner: string): void {
    this.db.transaction(() => {
      this.setMeta("frozen", owner);
      this.setMeta("frozenUntil", String(Date.now() + exportLeaseMs));
    });
  }

  private domainStore(): Store {
    if (!this.meta("sealed")) throw new StorageError("storage_migrating");
    return (this.store ??= new Store("cloudflare", this.db, {
      initialize: false,
    }));
  }

  async fetch(request: Request): Promise<Response> {
    try {
      if (!authorized(request, this.env.STORAGE_TOKEN))
        return json({ error: { code: "unauthorized" } }, 401);
      const generation = generationSchema.parse(
        request.headers.get("X-Storage-Generation"),
      );
      const path = new URL(request.url).pathname;
      if (path === "/migration/status" && request.method === "GET")
        return json({
          sealed: Boolean(this.meta("sealed")),
          locked: Boolean(this.meta("sealing") || this.exportLeaseOwner()),
        });
      if (path.startsWith("/blobs/"))
        return await this.blob(request, generation, path.slice(7));
      if (path === "/rpc" && request.method === "POST")
        return await this.rpc(request);
      if (path.startsWith("/migration/") && request.method === "POST")
        return await this.migration(request, path);
      return json({ error: { code: "not_found" } }, 404);
    } catch (error) {
      return storageFailure(error);
    }
  }

  private async rpc(request: Request): Promise<Response> {
    const input = rpcSchema.parse(await boundedJSON(request));
    if (
      input.issuedAt < Date.now() - 300_000 ||
      input.issuedAt > Date.now() + 30_000
    )
      throw new StorageError("storage_conflict");
    const args = input.args.map(decodeWire);
    const command = input.method === "$command";
    if (!command && !PUBLIC_METHODS.some((name) => name === input.method))
      throw new StorageError("storage_integrity");
    const commandName = command ? z.string().parse(args[0]) : "";
    const commandArgs = command ? z.array(z.unknown()).parse(args[1]) : [];
    const readOnly = command
      ? readOnlyStorageCommands.has(commandName)
      : READ_METHODS.has(input.method);
    if (!readOnly && this.exportLeaseOwner())
      throw new StorageError("storage_migrating");
    const store = this.domainStore();
    const invoke = (): unknown => {
      if (command)
        return dispatchStorageCommand(store, commandName, commandArgs);
      const method: unknown = Reflect.get(store, input.method);
      if (typeof method !== "function")
        throw new StorageError("storage_integrity");
      // No RPC argument can contain a function: callback parameters stay unavailable.
      return Reflect.apply(method, store, args);
    };
    if (readOnly) return json({ ok: true, result: encodeWire(invoke()) });
    const requestHash = sha256(
      JSON.stringify({ method: input.method, args: input.args }),
    );
    const response = this.db.transaction(() => {
      const previous = this.db
        .prepare("SELECT hash,result FROM _storage_receipts WHERE id=?")
        .get(input.requestId);
      if (previous) {
        if (
          previous.hash !== requestHash ||
          typeof previous.result !== "string"
        )
          throw new StorageError("storage_conflict");
        return previous.result;
      }
      const result = JSON.stringify({ ok: true, result: encodeWire(invoke()) });
      this.db
        .prepare("INSERT INTO _storage_receipts VALUES(?,?,?,?)")
        .run(input.requestId, requestHash, result, Date.now());
      // Old requests are rejected before receipt lookup, so pruning cannot execute
      // a previously acknowledged mutation twice.
      this.db
        .prepare("DELETE FROM _storage_receipts WHERE created_at<?")
        .run(Date.now() - 600_000);
      return result;
    });
    await this.state.storage.sync();
    return new Response(response, {
      headers: { ...jsonHeaders, "Content-Type": "application/json" },
    });
  }

  private async blob(
    request: Request,
    generation: string,
    encodedKey: string,
  ): Promise<Response> {
    const key = decodeURIComponent(encodedKey);
    if (!objectKey.test(key)) throw new StorageError("storage_integrity");
    const fullKey = `generations/${generation}/${key}`;
    if (request.method === "GET") {
      const object = await this.env.MEDIA.get(fullKey);
      if (!object) return json({ error: { code: "not_found" } }, 404);
      const digest = object.customMetadata?.sha256;
      if (!digest || !digestPattern.test(digest))
        throw new StorageError("storage_integrity");
      return new Response(await object.arrayBuffer(), {
        headers: {
          ...jsonHeaders,
          "Content-Type":
            object.httpMetadata?.contentType || "application/octet-stream",
          "Content-Length": String(object.size),
          "X-Content-SHA256": digest,
        },
      });
    }
    if (request.method === "DELETE") {
      return this.state.blockConcurrencyWhile(async () => {
        await this.env.MEDIA.delete(fullKey);
        this.db.transaction(() => {
          const previous = this.db
            .prepare("SELECT size FROM _storage_blobs WHERE key=?")
            .get(fullKey);
          if (typeof previous?.size === "number") {
            this.db
              .prepare("UPDATE _storage_blob_total SET size=size-? WHERE id=1")
              .run(previous.size);
            this.db
              .prepare("DELETE FROM _storage_blobs WHERE key=?")
              .run(fullKey);
          }
        });
        await this.state.storage.sync();
        return json({ ok: true });
      });
    }
    if (request.method !== "PUT")
      return json({ error: { code: "not_found" } }, 404);
    const digest = request.headers.get("X-Content-SHA256") || "";
    const declaredSize = Number(request.headers.get("Content-Length"));
    if (
      !digestPattern.test(digest) ||
      !Number.isSafeInteger(declaredSize) ||
      declaredSize < 1 ||
      declaredSize > 64 * 1024 * 1024
    )
      throw new StorageError("storage_integrity");
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength !== declaredSize || sha256(bytes) !== digest)
      throw new StorageError("storage_integrity");
    return this.state.blockConcurrencyWhile(async () => {
      const maximum = Number(this.env.MAX_STORAGE_BYTES || "9000000000");
      if (
        !Number.isSafeInteger(maximum) ||
        maximum < 1 ||
        maximum > 9_000_000_000
      )
        throw new StorageError("storage_configuration");
      this.db.transaction(() => {
        const previous = this.db
          .prepare("SELECT size,sha256 FROM _storage_blobs WHERE key=?")
          .get(fullKey);
        if (previous) {
          if (previous.size !== bytes.byteLength || previous.sha256 !== digest)
            throw new StorageError("storage_conflict");
          return;
        }
        const total = this.db
          .prepare("SELECT size FROM _storage_blob_total WHERE id=1")
          .get()?.size;
        if (typeof total !== "number" || total + bytes.byteLength > maximum)
          throw new StorageError("storage_limit");
        this.db
          .prepare("INSERT INTO _storage_blobs VALUES(?,?,?)")
          .run(fullKey, bytes.byteLength, digest);
        this.db
          .prepare("UPDATE _storage_blob_total SET size=size+? WHERE id=1")
          .run(bytes.byteLength);
      });
      // Reserve first. An interrupted upload can over-count, never under-count.
      // Repeating the same immutable object finishes the reservation safely.
      await this.state.storage.sync();
      await this.env.MEDIA.put(fullKey, bytes, {
        customMetadata: { sha256: digest },
        httpMetadata: {
          contentType:
            request.headers.get("Content-Type") || "application/octet-stream",
        },
        sha256: digest,
      });
      return new Response(null, {
        status: 204,
        headers: { ...jsonHeaders, "X-Content-SHA256": digest },
      });
    });
  }

  private storedArchive(): ArchiveMetadata {
    const values = (name: string): unknown[] =>
      this.db
        .prepare(`SELECT value FROM ${quoted(name)} ORDER BY position`)
        .all()
        .map((row) => {
          if (typeof row.value !== "string")
            throw new StorageError("storage_integrity");
          return JSON.parse(row.value);
        });
    return archiveMetadataSchema.parse({
      schemaVersion: Number(this.meta("schemaVersion")),
      tables: values("_storage_archive_tables"),
      indexes: values("_storage_archive_indexes"),
      blobs: values("_storage_archive_blobs"),
    });
  }

  private storedTable(name: string): TableDescription | undefined {
    return this.db
      .prepare("SELECT value FROM _storage_archive_tables ORDER BY position")
      .all()
      .map((row) => {
        if (typeof row.value !== "string")
          throw new StorageError("storage_integrity");
        return archiveMetadataSchema.shape.tables.element.parse(
          JSON.parse(row.value),
        );
      })
      .find((table) => table.name === name);
  }

  private orderedSelect(table: TableDescription): string {
    const order = table.primaryKey.length ? table.primaryKey : table.columns;
    return `SELECT ${table.columns.map(quoted).join(",")} FROM ${quoted(table.name)} ORDER BY ${order.map(quoted).join(",")}`;
  }

  private tableDigest(table: TableDescription): {
    count: number;
    sha256: string;
  } {
    const digest = createHash("sha256");
    let count = 0;
    for (const row of this.state.storage.sql.exec(this.orderedSelect(table))) {
      digest.update(canonicalRow(table.columns, storageRowSchema.parse(row)));
      count++;
    }
    return { count, sha256: digest.digest("hex") };
  }

  private currentArchive(): ArchiveMetadata {
    const unordered: TableDescription[] = this.db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE '_storage_%' AND name NOT GLOB '_cf_*' AND name != '__miniflare_do_name' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name",
      )
      .all()
      .map((table) => {
        if (typeof table.name !== "string" || typeof table.sql !== "string")
          throw new StorageError("storage_integrity");
        const fields = this.db
          .prepare(`PRAGMA table_info(${quoted(table.name)})`)
          .all();
        const columns = fields.map((field) => z.string().parse(field.name));
        const primaryKey = fields
          .filter((field) => Number(field.pk) > 0)
          .sort((a, b) => Number(a.pk) - Number(b.pk))
          .map((field) => z.string().parse(field.name));
        const entry = {
          name: table.name,
          columns,
          primaryKey,
          createSql: table.sql,
          count: 0,
          sha256: "",
        };
        return { ...entry, ...this.tableDigest(entry) };
      });
    const remaining = new Map(unordered.map((table) => [table.name, table]));
    const dependencies = new Map(
      unordered.map((table) => [
        table.name,
        this.db
          .prepare(`PRAGMA foreign_key_list(${quoted(table.name)})`)
          .all()
          .map((row) => z.string().parse(row.table))
          .filter((name) => name !== table.name),
      ]),
    );
    const tables: TableDescription[] = [];
    while (remaining.size) {
      const ready = [...remaining.values()].filter(
        (table) =>
          table.name !== "sqlite_sequence" &&
          dependencies.get(table.name)?.every((name) => !remaining.has(name)),
      );
      if (!ready.length) {
        const sequence = remaining.get("sqlite_sequence");
        if (remaining.size === 1 && sequence) {
          tables.push(sequence);
          break;
        }
        throw new StorageError("storage_integrity");
      }
      for (const table of ready) {
        tables.push(table);
        remaining.delete(table.name);
      }
    }
    const indexes = this.db
      .prepare(
        "SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE '_storage_%' AND name NOT GLOB '_cf_*' AND tbl_name != '__miniflare_do_name' ORDER BY name",
      )
      .all()
      .map((row) => ({
        name: z.string().parse(row.name),
        sql: z.string().parse(row.sql),
      }));
    const blobMap = new Map<string, ArchiveMetadata["blobs"][number]>();
    // Uploads are immutable and recorded after R2 validates their checksum.
    // The portable exporter independently downloads and hashes every object.
    // This avoids one R2 subrequest per object inside a single Worker invocation.
    for (const row of this.db
      .prepare(
        "SELECT key,size,sha256,content_type FROM _storage_verified_blobs ORDER BY key",
      )
      .all()) {
      const blob = archiveMetadataSchema.shape.blobs.element.parse({
        key: row.key,
        size: row.size,
        sha256: row.sha256,
        contentType: row.content_type,
      });
      blobMap.set(blob.key, blob);
    }
    for (const row of this.db
      .prepare("SELECT id,data FROM media ORDER BY id")
      .all()) {
      const metadata = z
        .object({
          extension: z.string().optional(),
          type: z.string().optional(),
        })
        .passthrough()
        .parse(JSON.parse(z.string().parse(row.data)));
      const key = `media/${z.string().parse(row.id)}.${metadata.extension || "mp4"}`;
      if (!objectKey.test(key)) throw new StorageError("storage_integrity");
      const object = blobMap.get(key);
      if (!object) throw new StorageError("storage_integrity");
      blobMap.set(key, {
        ...object,
        contentType: metadata.type || "video/mp4",
      });
    }
    return {
      schemaVersion: Number(
        this.db.prepare("SELECT MAX(version) AS version FROM migrations").get()
          ?.version,
      ),
      tables,
      indexes,
      blobs: [...blobMap.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  private async migration(request: Request, path: string): Promise<Response> {
    const input = await boundedJSON(
      request,
      path === "/migration/start" ? 32 * 1024 * 1024 : 1_048_576,
    );
    if (path === "/migration/record-blob") {
      const blob = archiveMetadataSchema.shape.blobs.element.parse(input);
      this.db.transaction(() => {
        const previous = this.db
          .prepare(
            "SELECT size,sha256 FROM _storage_verified_blobs WHERE key=?",
          )
          .get(blob.key);
        if (
          previous &&
          (previous.size !== blob.size || previous.sha256 !== blob.sha256)
        )
          throw new StorageError("storage_conflict");
        this.db
          .prepare(
            "INSERT OR IGNORE INTO _storage_verified_blobs VALUES(?,?,?,?)",
          )
          .run(blob.key, blob.size, blob.sha256, blob.contentType);
      });
      await this.state.storage.sync();
      return json({ ok: true });
    }
    if (path === "/migration/drop-blob") {
      const { key } = z
        .object({ key: z.string().regex(objectKey) })
        .strict()
        .parse(input);
      this.db.transaction(() => {
        if (this.meta("sealing") || this.exportLeaseOwner())
          throw new StorageError("storage_migrating");
        if (
          this.db
            .prepare(
              "SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name='media'",
            )
            .get()
        ) {
          const id = key.slice("media/".length).split(".")[0];
          if (
            this.db.prepare("SELECT 1 AS found FROM media WHERE id=?").get(id)
          )
            throw new StorageError("storage_conflict");
        }
        this.db
          .prepare("DELETE FROM _storage_verified_blobs WHERE key=?")
          .run(key);
      });
      await this.state.storage.sync();
      return json({ ok: true });
    }
    if (path === "/migration/start") {
      const parsed = z
        .object({
          migrationId: z.uuid(),
          manifestHash: z.string().regex(digestPattern),
          ...archiveMetadataSchema.shape,
        })
        .strict()
        .parse(input);
      const { migrationId, manifestHash, ...metadata } = parsed;
      if (sha256(canonicalMetadata(metadata)) !== manifestHash)
        throw new StorageError("storage_integrity");
      if (this.meta("migrationId")) {
        if (
          this.meta("migrationId") !== migrationId ||
          this.meta("manifestHash") !== manifestHash
        )
          throw new StorageError("storage_conflict");
        return json({ ok: true });
      }
      if (
        metadata.schemaVersion !== 12 ||
        !metadata.tables.some((table) => table.name === "migrations")
      )
        throw new StorageError("storage_integrity");
      const names = new Set<string>();
      for (const table of metadata.tables) {
        if (
          table.name.startsWith("_storage_") ||
          table.name.startsWith("_cf_") ||
          table.name === "__miniflare_do_name" ||
          names.has(table.name) ||
          !/^CREATE\s+TABLE\s+/i.test(table.createSql) ||
          table.createSql.includes(";")
        )
          throw new StorageError("storage_integrity");
        names.add(table.name);
      }
      this.db.transaction(() => {
        const existing = this.db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_storage_%' AND name NOT GLOB '_cf_*' AND name != '__miniflare_do_name' AND name NOT LIKE 'sqlite_%'",
          )
          .all();
        if (existing.length) throw new StorageError("storage_conflict");
        for (const [position, table] of metadata.tables.entries()) {
          if (table.name !== "sqlite_sequence") this.db.exec(table.createSql);
          const fields = this.db
            .prepare(`PRAGMA table_info(${quoted(table.name)})`)
            .all();
          if (
            JSON.stringify(fields.map((field) => field.name)) !==
            JSON.stringify(table.columns)
          )
            throw new StorageError("storage_integrity");
          this.db
            .prepare("INSERT INTO _storage_archive_tables VALUES(?,?)")
            .run(position, JSON.stringify(table));
        }
        for (const [position, index] of metadata.indexes.entries()) {
          if (
            index.name.startsWith("_storage_") ||
            !/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(index.sql) ||
            index.sql.includes(";")
          )
            throw new StorageError("storage_integrity");
          this.db.exec(index.sql);
          this.db
            .prepare("INSERT INTO _storage_archive_indexes VALUES(?,?)")
            .run(position, JSON.stringify(index));
        }
        for (const [position, blob] of metadata.blobs.entries())
          this.db
            .prepare("INSERT INTO _storage_archive_blobs VALUES(?,?)")
            .run(position, JSON.stringify(blob));
        this.setMeta("migrationId", migrationId);
        this.setMeta("manifestHash", manifestHash);
        this.setMeta("schemaVersion", String(metadata.schemaVersion));
      });
      await this.state.storage.sync();
      return json({ ok: true });
    }
    if (path === "/migration/import") {
      const parsed = z
        .object({
          migrationId: z.uuid(),
          table: z.string(),
          batchId: z.string().min(1).max(200),
          rows: z.array(storageRowSchema).min(1).max(500),
        })
        .strict()
        .parse(input);
      if (parsed.migrationId !== this.meta("migrationId"))
        throw new StorageError("storage_conflict");
      const table = this.storedTable(parsed.table);
      if (!table) throw new StorageError("storage_integrity");
      const batchHash = sha256(JSON.stringify(parsed));
      this.db.transaction(() => {
        const previous = this.db
          .prepare("SELECT hash FROM _storage_imports WHERE id=?")
          .get(parsed.batchId);
        if (previous) {
          if (previous.hash !== batchHash)
            throw new StorageError("storage_conflict");
          return;
        }
        if (this.meta("sealed") || this.meta("sealing"))
          throw new StorageError("storage_conflict");
        this.db.exec("PRAGMA defer_foreign_keys=ON");
        if (
          table.name === "sqlite_sequence" &&
          !this.meta("sequenceImported")
        ) {
          this.db.exec("DELETE FROM sqlite_sequence");
          this.setMeta("sequenceImported", "true");
        }
        const insert = this.db.prepare(
          `INSERT INTO ${quoted(table.name)} (${table.columns.map(quoted).join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`,
        );
        for (const row of parsed.rows) {
          canonicalRow(table.columns, row);
          insert.run(...table.columns.map((column) => row[column]));
        }
        this.db
          .prepare("INSERT INTO _storage_imports VALUES(?,?)")
          .run(parsed.batchId, batchHash);
      });
      await this.state.storage.sync();
      return json({ ok: true });
    }
    if (path === "/migration/export") {
      const parsed = z
        .object({
          table: z.string(),
          offset: z.number().int().nonnegative().default(0),
          limit: z.number().int().min(1).max(500).default(500),
          cursor: z
            .array(z.union([z.string(), z.number(), z.null()]))
            .optional(),
          migrationId: z.uuid().optional(),
        })
        .strict()
        .parse(input);
      const leaseOwner = this.exportLeaseOwner();
      if (parsed.migrationId && parsed.migrationId !== leaseOwner)
        throw new StorageError("storage_conflict");
      if (leaseOwner && !parsed.migrationId)
        throw new StorageError("storage_migrating");
      const table = this.storedTable(parsed.table);
      if (!table) throw new StorageError("storage_integrity");
      const order = table.primaryKey.length ? table.primaryKey : table.columns;
      if (parsed.cursor && parsed.cursor.length !== order.length)
        throw new StorageError("storage_integrity");
      const rows = parsed.cursor
        ? this.db
            .prepare(
              `SELECT ${table.columns.map(quoted).join(",")} FROM ${quoted(table.name)} WHERE (${order.map(quoted).join(",")}) > (${order.map(() => "?").join(",")}) ORDER BY ${order.map(quoted).join(",")} LIMIT ?`,
            )
            .all(...parsed.cursor, parsed.limit)
        : this.db
            .prepare(`${this.orderedSelect(table)} LIMIT ? OFFSET ?`)
            .all(parsed.limit, parsed.offset);
      const last = rows.at(-1);
      if (parsed.migrationId) {
        this.renewExportLease(parsed.migrationId);
        await this.state.storage.sync();
      }
      return json({
        rows,
        ...(last ? { nextCursor: order.map((column) => last[column]) } : {}),
      });
    }
    if (path === "/migration/seal") {
      const parsed = z
        .object({
          migrationId: z.uuid(),
          manifestHash: z.string().regex(digestPattern),
        })
        .strict()
        .parse(input);
      if (
        parsed.migrationId !== this.meta("migrationId") ||
        parsed.manifestHash !== this.meta("manifestHash")
      )
        throw new StorageError("storage_conflict");
      if (this.meta("sealed"))
        return json({ ok: true, manifestHash: parsed.manifestHash });
      this.setMeta("sealing", parsed.manifestHash);
      await this.state.storage.sync();
      const metadata = this.storedArchive();
      for (const table of metadata.tables) {
        const actual = this.tableDigest(table);
        if (actual.count !== table.count || actual.sha256 !== table.sha256)
          throw new StorageError("storage_integrity");
        // Durable Objects intentionally disallow integrity_check. Verify each
        // table with the supported quick_check and check FKs separately.
        if (
          this.db.prepare(`PRAGMA quick_check(${quoted(table.name)})`).get()
            ?.quick_check !== "ok"
        )
          throw new StorageError("storage_integrity");
      }
      if (this.db.prepare("PRAGMA foreign_key_check").all().length)
        throw new StorageError("storage_integrity");
      for (const blob of metadata.blobs) {
        const object = this.db
          .prepare(
            "SELECT size,sha256 FROM _storage_verified_blobs WHERE key=?",
          )
          .get(blob.key);
        if (
          !object ||
          object.size !== blob.size ||
          object.sha256 !== blob.sha256
        )
          throw new StorageError("storage_integrity");
      }
      this.setMeta("sealed", parsed.manifestHash);
      this.db.prepare("DELETE FROM _storage_meta WHERE id='sealing'").run();
      await this.state.storage.sync();
      return json({ ok: true, manifestHash: parsed.manifestHash });
    }
    if (path === "/migration/freeze") {
      const parsed = z.object({ migrationId: z.uuid() }).strict().parse(input);
      if (!this.meta("sealed")) throw new StorageError("storage_migrating");
      if (
        this.exportLeaseOwner() &&
        this.exportLeaseOwner() !== parsed.migrationId
      )
        throw new StorageError("storage_conflict");
      if (this.buildingArchive) throw new StorageError("storage_migrating");
      this.buildingArchive = true;
      try {
        this.renewExportLease(parsed.migrationId);
        await this.state.storage.sync();
        const metadata = this.currentArchive();
        return json({
          ...metadata,
          manifestHash: sha256(canonicalMetadata(metadata)),
          migrationId: parsed.migrationId,
        });
      } finally {
        this.buildingArchive = false;
      }
    }
    if (path === "/migration/unfreeze") {
      const parsed = z.object({ migrationId: z.uuid() }).strict().parse(input);
      if (this.exportLeaseOwner() !== parsed.migrationId)
        throw new StorageError("storage_conflict");
      if (this.buildingArchive) throw new StorageError("storage_migrating");
      this.db
        .prepare(
          "DELETE FROM _storage_meta WHERE id IN ('frozen','frozenUntil')",
        )
        .run();
      await this.state.storage.sync();
      return json({ ok: true });
    }
    return json({ error: { code: "not_found" } }, 404);
  }
}

const worker = {
  async fetch(request: Request, env: StorageEnvironment): Promise<Response> {
    try {
      if (!authorized(request, env.STORAGE_TOKEN))
        return json({ error: { code: "unauthorized" } }, 401);
      const generation = generationSchema.parse(
        request.headers.get("X-Storage-Generation"),
      );
      const path = new URL(request.url).pathname;
      if (path.startsWith("/blobs/") && request.method === "DELETE") {
        const statusURL = new URL("/migration/drop-blob", request.url);
        const headers = new Headers(request.headers);
        headers.delete("Content-Length");
        headers.set("Content-Type", "application/json");
        const response = await env.STORAGE.get(
          env.STORAGE.idFromName(generation),
        ).fetch(
          new Request(statusURL, {
            method: "POST",
            headers,
            body: JSON.stringify({ key: decodeURIComponent(path.slice(7)) }),
          }),
        );
        if (!response.ok) return response;
      }
      // One shared ledger reserves the budget across active AND staged generations.
      const name = path.startsWith("/blobs/") ? "blob-budget-v1" : generation;
      const response = await env.STORAGE.get(
        env.STORAGE.idFromName(name),
      ).fetch(request);
      if (
        response.ok &&
        path.startsWith("/blobs/") &&
        request.method === "PUT"
      ) {
        const headers = new Headers(request.headers);
        headers.delete("Content-Length");
        headers.set("Content-Type", "application/json");
        const recorded = await env.STORAGE.get(
          env.STORAGE.idFromName(generation),
        ).fetch(
          new Request(new URL("/migration/record-blob", request.url), {
            method: "POST",
            headers,
            body: JSON.stringify({
              key: decodeURIComponent(path.slice(7)),
              size: Number(request.headers.get("Content-Length")),
              sha256: response.headers.get("X-Content-SHA256"),
              contentType:
                request.headers.get("Content-Type") ||
                "application/octet-stream",
            }),
          }),
        );
        if (!recorded.ok) return recorded;
      }
      return response;
    } catch (error) {
      return storageFailure(error);
    }
  },
};

export default worker;
