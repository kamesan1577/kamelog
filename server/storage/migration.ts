import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  archiveMetadataSchema,
  canonicalMetadata,
  canonicalRow,
  quoteIdentifier,
  storageRowSchema,
  type ArchiveMetadata,
  type StorageRow,
  type TableDescription,
} from "./archive-format.ts";
import {
  GatewayBlobStorage,
  LocalBlobStorage,
  blobDigest,
  type BlobStorage,
} from "./blobs.ts";
import { StorageError } from "./errors.ts";
import { Store } from "./local-store.ts";

export interface GatewayOptions {
  endpoint: string;
  token: string;
  generation: string;
  fetch?: typeof fetch;
}

export interface MigrationTarget {
  readonly blobs: BlobStorage;
  start(
    migrationId: string,
    metadata: ArchiveMetadata,
    manifestHash: string,
  ): Promise<void>;
  importRows(
    migrationId: string,
    table: string,
    batchId: string,
    rows: StorageRow[],
  ): Promise<void>;
  exportRows(
    table: string,
    offset: number,
    limit: number,
  ): Promise<StorageRow[]>;
  seal(migrationId: string, manifestHash: string): Promise<void>;
}

const migrationRecordSchema = z
  .object({
    version: z.literal(1),
    migrationId: z.uuid(),
    generation: z.uuid(),
    backupDirectory: z.string(),
  })
  .strict();
const archiveRecordSchema = z
  .object({
    version: z.literal(1),
    metadata: archiveMetadataSchema,
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const backupManifestSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.string(),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();

export function archiveManifestHash(metadata: ArchiveMetadata): string {
  return createHash("sha256").update(canonicalMetadata(metadata)).digest("hex");
}

async function fileDigest(path: string): Promise<string> {
  if (!(await lstat(path)).isFile())
    throw new StorageError("storage_integrity");
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

async function emptyDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if ((await readdir(path)).length) throw new StorageError("storage_conflict");
  await chmod(path, 0o700);
}

function validateDatabase(database: DatabaseSync): void {
  if (
    database.prepare("PRAGMA integrity_check").get()?.integrity_check !==
      "ok" ||
    database.prepare("PRAGMA foreign_key_check").all().length
  )
    throw new StorageError("storage_integrity");
  // Archive version 1 represents tables and indexes. Refuse schemas with other
  // executable objects instead of silently dropping their behavior on restore.
  if (
    database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type IN ('trigger','view') LIMIT 1",
      )
      .get()
  )
    throw new StorageError("storage_integrity");
}

async function localMediaKeys(source: string): Promise<string[]> {
  const names = await readdir(join(source, "media")).catch((error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  });
  return names
    .filter((name) => /^[a-f0-9-]{36}\.(mp4|png|jpg|webp|gif)$/.test(name))
    .map((name) => `media/${name}`)
    .sort();
}

function tableRows(
  database: DatabaseSync,
  table: TableDescription,
  offset: number,
  limit = 250,
): StorageRow[] {
  const order = table.primaryKey.length ? table.primaryKey : table.columns;
  return database
    .prepare(
      `SELECT ${table.columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(table.name)} ORDER BY ${order.map(quoteIdentifier).join(",")} LIMIT ? OFFSET ?`,
    )
    .all(limit, offset)
    .map((row) => storageRowSchema.parse(row));
}

/** Foreign-key parents precede dependents; sqlite_sequence follows all rows. */
function describeTables(database: DatabaseSync): TableDescription[] {
  const schemas = database
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type='table' AND (name NOT LIKE 'sqlite_%' OR name='sqlite_sequence') ORDER BY name",
    )
    .all();
  const descriptions = new Map<string, TableDescription>();
  const dependencies = new Map<string, Set<string>>();
  for (const schema of schemas) {
    const name = z.string().parse(schema.name);
    if (name.startsWith("_storage_")) continue;
    const columns = database
      .prepare(`PRAGMA table_info(${quoteIdentifier(name)})`)
      .all();
    const table: TableDescription = {
      name,
      columns: columns.map((column) => z.string().parse(column.name)),
      primaryKey: columns
        .filter((column) => Number(column.pk) > 0)
        .sort((left, right) => Number(left.pk) - Number(right.pk))
        .map((column) => z.string().parse(column.name)),
      createSql: z.string().parse(schema.sql),
      count: 0,
      sha256: "",
    };
    const digest = createHash("sha256");
    for (let offset = 0; ;) {
      const rows = tableRows(database, table, offset);
      for (const row of rows) digest.update(canonicalRow(table.columns, row));
      table.count += rows.length;
      if (!rows.length) break;
      offset += rows.length;
    }
    table.sha256 = digest.digest("hex");
    descriptions.set(name, table);
    dependencies.set(
      name,
      new Set(
        database
          .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(name)})`)
          .all()
          .map((row) => z.string().parse(row.table))
          .filter((parent) => parent !== name),
      ),
    );
  }
  const result: TableDescription[] = [];
  while (descriptions.size) {
    const ready = [...descriptions.values()].filter(
      (table) =>
        table.name !== "sqlite_sequence" &&
        [...(dependencies.get(table.name) || [])].every(
          (parent) => !descriptions.has(parent),
        ),
    );
    if (!ready.length) {
      const sequence = descriptions.get("sqlite_sequence");
      if (descriptions.size === 1 && sequence) {
        result.push(sequence);
        break;
      }
      throw new StorageError("storage_integrity");
    }
    for (const table of ready) {
      result.push(table);
      descriptions.delete(table.name);
    }
  }
  return result;
}

function describeIndexes(database: DatabaseSync): ArchiveMetadata["indexes"] {
  return database
    .prepare(
      "SELECT name, sql FROM sqlite_schema WHERE type='index' AND sql IS NOT NULL ORDER BY name",
    )
    .all()
    .filter((row) => !String(row.name).startsWith("_storage_"))
    .map((row) => ({
      name: z.string().parse(row.name),
      sql: z.string().parse(row.sql),
    }));
}

function mediaReferences(database: DatabaseSync): Map<string, string> {
  const refs = new Map<string, string>();
  for (const row of database.prepare("SELECT id,data FROM media").all()) {
    const data = z
      .object({ extension: z.string().optional(), type: z.string().optional() })
      .passthrough()
      .parse(JSON.parse(z.string().parse(row.data)));
    const key = `media/${row.id}.${data.extension || "mp4"}`;
    refs.set(key, data.type || "video/mp4");
  }
  for (const table of ["posts", "drafts", "settings"]) {
    for (const row of database
      .prepare(`SELECT data FROM ${quoteIdentifier(table)}`)
      .all()) {
      const data = z.string().parse(row.data);
      for (const match of data.matchAll(/\/api\/media\/([a-f0-9-]{36})/g)) {
        const id = match[1];
        if (![...refs.keys()].some((key) => key.startsWith(`media/${id}.`)))
          throw new StorageError("storage_integrity");
      }
    }
  }
  return refs;
}

/** Captures a consistent DB snapshot after a maintenance fence drains writers. */
export async function createLocalArchive(
  source: string,
  target: string,
): Promise<ArchiveMetadata> {
  source = resolve(source);
  target = resolve(target);
  if (target === source || target.startsWith(source + "/"))
    throw new StorageError("storage_configuration");
  await emptyDirectory(target);
  const lock = new DatabaseSync(join(source, "kamelog.sqlite"));
  lock.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  const sourceReader = new DatabaseSync(join(source, "kamelog.sqlite"), {
    readOnly: true,
  });
  try {
    validateDatabase(sourceReader);
    await backup(sourceReader, join(target, "kamelog.sqlite"));
  } finally {
    sourceReader.close();
    lock.exec("ROLLBACK");
    lock.close();
  }
  await chmod(join(target, "kamelog.sqlite"), 0o600);
  const snapshot = new DatabaseSync(join(target, "kamelog.sqlite"), {
    readOnly: true,
  });
  try {
    validateDatabase(snapshot);
    const required = mediaReferences(snapshot);
    const keys = new Set([
      ...required.keys(),
      ...(await localMediaKeys(source)),
    ]);
    const blobs: ArchiveMetadata["blobs"] = [];
    const sourceBlobs = new LocalBlobStorage(source);
    const targetBlobs = new LocalBlobStorage(target);
    for (const key of [...keys].sort()) {
      const bytes = await sourceBlobs.get(key);
      const contentType = required.get(key) || "application/octet-stream";
      await targetBlobs.put(key, bytes);
      blobs.push({
        key,
        size: bytes.length,
        sha256: blobDigest(bytes),
        contentType,
      });
    }
    const metadata: ArchiveMetadata = {
      schemaVersion: z
        .number()
        .parse(
          snapshot
            .prepare("SELECT MAX(version) AS version FROM migrations")
            .get()?.version,
        ),
      tables: describeTables(snapshot),
      indexes: describeIndexes(snapshot),
      blobs,
    };
    const files: Record<string, string> = {
      "kamelog.sqlite": await fileDigest(join(target, "kamelog.sqlite")),
    };
    for (const blob of blobs) files[blob.key] = blob.sha256;
    await writeFile(
      join(target, "manifest.json"),
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        files,
      }),
      { mode: 0o600, flag: "wx" },
    );
    await writeFile(
      join(target, "migration.json"),
      JSON.stringify({
        version: 1,
        metadata,
        manifestHash: archiveManifestHash(metadata),
      }),
      { mode: 0o600, flag: "wx" },
    );
    return metadata;
  } finally {
    snapshot.close();
  }
}

export async function verifyArchive(
  directory: string,
): Promise<ArchiveMetadata> {
  const archive = archiveRecordSchema.parse(
    JSON.parse(await readFile(join(directory, "migration.json"), "utf8")),
  );
  const manifest = backupManifestSchema.parse(
    JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
  );
  if (
    archive.manifestHash !== archiveManifestHash(archive.metadata) ||
    !manifest.files["kamelog.sqlite"]
  )
    throw new StorageError("storage_integrity");
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (
      file !== "kamelog.sqlite" &&
      !/^media\/[a-f0-9-]{36}\.(mp4|png|jpg|webp|gif)$/.test(file)
    )
      throw new StorageError("storage_integrity");
    if ((await fileDigest(join(directory, file))) !== digest)
      throw new StorageError("storage_integrity");
  }
  for (const blob of archive.metadata.blobs) {
    if (
      manifest.files[blob.key] !== blob.sha256 ||
      (await lstat(join(directory, blob.key))).size !== blob.size
    )
      throw new StorageError("storage_integrity");
  }
  const database = new DatabaseSync(join(directory, "kamelog.sqlite"), {
    readOnly: true,
  });
  try {
    validateDatabase(database);
    if (
      JSON.stringify(describeTables(database)) !==
        JSON.stringify(archive.metadata.tables) ||
      JSON.stringify(describeIndexes(database)) !==
        JSON.stringify(archive.metadata.indexes)
    )
      throw new StorageError("storage_integrity");
    for (const key of mediaReferences(database).keys())
      if (!manifest.files[key]) throw new StorageError("storage_integrity");
  } finally {
    database.close();
  }
  return archive.metadata;
}

export class GatewayMigrationTarget implements MigrationTarget {
  readonly blobs: GatewayBlobStorage;
  private readonly options: GatewayOptions;
  private exportMigrationId?: string;
  private readonly cursors = new Map<
    string,
    { offset: number; value: Array<string | number | null> }
  >();
  constructor(options: GatewayOptions) {
    this.options = options;
    this.blobs = new GatewayBlobStorage(options);
  }

  /** Export pages must renew this exact lease rather than read an unfenced DB. */
  setExportLease(migrationId: string): void {
    this.exportMigrationId = z.uuid().parse(migrationId);
    this.cursors.clear();
  }

  async request(path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await (this.options.fetch || fetch)(
        new URL(path, this.options.endpoint),
        {
          method: body === undefined ? "GET" : "POST",
          headers: {
            Authorization: `Bearer ${this.options.token}`,
            "Content-Type": "application/json",
            "X-Storage-Generation": this.options.generation,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch {
      throw new StorageError("storage_unavailable");
    }
    if (!response.ok) {
      if ([429, 507].includes(response.status))
        throw new StorageError("storage_limit");
      if (response.status === 409) throw new StorageError("storage_conflict");
      if (response.status === 423) throw new StorageError("storage_migrating");
      throw new StorageError("storage_unavailable");
    }
    try {
      return await response.json();
    } catch {
      throw new StorageError("storage_integrity");
    }
  }

  async start(
    migrationId: string,
    metadata: ArchiveMetadata,
    manifestHash: string,
  ): Promise<void> {
    await this.request("/migration/start", {
      migrationId,
      ...metadata,
      manifestHash,
    });
  }
  async importRows(
    migrationId: string,
    table: string,
    batchId: string,
    rows: StorageRow[],
  ): Promise<void> {
    await this.request("/migration/import", {
      migrationId,
      table,
      batchId,
      rows,
    });
  }
  async exportRows(
    table: string,
    offset: number,
    limit: number,
  ): Promise<StorageRow[]> {
    const cursor = this.cursors.get(table);
    const result = z
      .object({
        rows: z.array(storageRowSchema),
        nextCursor: z
          .array(z.union([z.string(), z.number().finite(), z.null()]))
          .nullable()
          .optional(),
      })
      .parse(
        await this.request("/migration/export", {
          table,
          offset,
          limit,
          ...(this.exportMigrationId
            ? { migrationId: this.exportMigrationId }
            : {}),
          ...(cursor?.offset === offset ? { cursor: cursor.value } : {}),
        }),
      );
    if (result.nextCursor)
      this.cursors.set(table, {
        offset: offset + result.rows.length,
        value: result.nextCursor,
      });
    return result.rows;
  }
  async seal(migrationId: string, manifestHash: string): Promise<void> {
    await this.request("/migration/seal", { migrationId, manifestHash });
  }
}

async function verifyTarget(
  target: MigrationTarget,
  metadata: ArchiveMetadata,
): Promise<void> {
  for (const table of metadata.tables) {
    const digest = createHash("sha256");
    let offset = 0;
    while (true) {
      const rows = await target.exportRows(table.name, offset, 250);
      if (rows.length > 250 || offset + rows.length > table.count)
        throw new StorageError("storage_integrity");
      for (const row of rows) digest.update(canonicalRow(table.columns, row));
      offset += rows.length;
      if (!rows.length) break;
    }
    if (offset !== table.count || digest.digest("hex") !== table.sha256)
      throw new StorageError("storage_integrity");
  }
  for (const blob of metadata.blobs) {
    const bytes = await target.blobs.get(blob.key);
    if (bytes.length !== blob.size || blobDigest(bytes) !== blob.sha256)
      throw new StorageError("storage_integrity");
  }
}

/** Retry-safe imports; the source stays fenced until verified activation or cancel. */
export async function migrateStorage(options: {
  source: string;
  backupDirectory: string;
  target: (generation: string) => MigrationTarget;
  generation?: string;
}): Promise<{ generation: string; manifestHash: string }> {
  const source = resolve(options.source);
  const backupDirectory = resolve(options.backupDirectory);
  if (backupDirectory === source || backupDirectory.startsWith(source + "/"))
    throw new StorageError("storage_configuration");
  const sourceFile = await lstat(join(source, "kamelog.sqlite"));
  if (!sourceFile.isFile() || sourceFile.isSymbolicLink())
    throw new StorageError("storage_integrity");
  const markerPath = join(source, "storage-maintenance.json");
  let current: unknown;
  try {
    current = JSON.parse(await readFile(join(source, "storage.json"), "utf8"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  let marker: z.infer<typeof migrationRecordSchema>;
  let target: MigrationTarget | undefined;
  try {
    marker = migrationRecordSchema.parse(
      JSON.parse(await readFile(markerPath, "utf8")),
    );
    if (marker.backupDirectory !== backupDirectory)
      throw new StorageError("storage_conflict");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    if (
      current !== undefined &&
      z.object({ provider: z.string() }).parse(current).provider !== "local"
    )
      throw new StorageError("storage_conflict");
    await emptyDirectory(backupDirectory);
    marker = {
      version: 1,
      migrationId: randomUUID(),
      generation: z.uuid().parse(options.generation || randomUUID()),
      backupDirectory,
    };
    // Validate connection configuration before fencing an otherwise usable site.
    target = options.target(marker.generation);
    await writeFile(markerPath, JSON.stringify(marker), {
      flag: "wx",
      mode: 0o600,
    });
  }
  if (current !== undefined) {
    const selector = z
      .object({
        version: z.literal(1),
        provider: z.string(),
        generation: z.string().optional(),
      })
      .parse(current);
    if (selector.provider !== "local") {
      if (
        selector.provider === "cloudflare" &&
        selector.generation === marker.generation
      ) {
        const metadata = await verifyArchive(backupDirectory);
        await rm(markerPath);
        return {
          generation: marker.generation,
          manifestHash: archiveManifestHash(metadata),
        };
      }
      throw new StorageError("storage_conflict");
    }
  }
  try {
    await lstat(join(backupDirectory, "migration.json"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
    // A marker owns this initially empty destination. Keep interrupted copies for
    // inspection, then take a fresh snapshot instead of accepting partial files.
    const partial = await readdir(backupDirectory).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return [];
      throw error;
    });
    if (partial.length)
      await rename(
        backupDirectory,
        `${backupDirectory}.partial-${randomUUID()}`,
      );
    await createLocalArchive(source, backupDirectory);
  }
  const metadata = await verifyArchive(backupDirectory);
  const manifestHash = archiveManifestHash(metadata);
  target ??= options.target(marker.generation);
  await target.start(marker.migrationId, metadata, manifestHash);
  const sourceBlobs = new LocalBlobStorage(backupDirectory);
  for (const blob of metadata.blobs)
    await target.blobs.put(
      blob.key,
      await sourceBlobs.get(blob.key),
      blob.contentType,
    );
  const database = new DatabaseSync(join(backupDirectory, "kamelog.sqlite"), {
    readOnly: true,
  });
  try {
    for (const table of metadata.tables) {
      for (let offset = 0; offset < table.count;) {
        let rows = tableRows(database, table, offset, 250);
        while (
          Buffer.byteLength(JSON.stringify(rows)) > 900_000 &&
          rows.length > 1
        )
          rows = rows.slice(0, Math.ceil(rows.length / 2));
        if (Buffer.byteLength(JSON.stringify(rows)) > 900_000)
          throw new StorageError("storage_limit");
        await target.importRows(
          marker.migrationId,
          table.name,
          `${table.name}:${offset}`,
          rows,
        );
        offset += rows.length;
      }
    }
  } finally {
    database.close();
  }
  await verifyTarget(target, metadata);
  await target.seal(marker.migrationId, manifestHash);
  // Detect unsupported writers that ignored maintenance while bytes were copied.
  const sourceLock = new DatabaseSync(join(source, "kamelog.sqlite"));
  sourceLock.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  try {
    validateDatabase(sourceLock);
    if (
      JSON.stringify(describeTables(sourceLock)) !==
        JSON.stringify(metadata.tables) ||
      JSON.stringify(describeIndexes(sourceLock)) !==
        JSON.stringify(metadata.indexes) ||
      JSON.stringify(await localMediaKeys(source)) !==
        JSON.stringify(metadata.blobs.map((blob) => blob.key).sort())
    )
      throw new StorageError("storage_conflict");
    for (const blob of metadata.blobs)
      if ((await fileDigest(join(source, blob.key))) !== blob.sha256)
        throw new StorageError("storage_conflict");
    const selector = JSON.stringify({
      version: 1,
      provider: "cloudflare",
      generation: marker.generation,
    });
    const temporary = join(source, `.storage-${marker.migrationId}.json`);
    const file = await open(temporary, "w", 0o600);
    try {
      await file.writeFile(selector);
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, join(source, "storage.json"));
    const directory = await open(source, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } finally {
    sourceLock.exec("ROLLBACK");
    sourceLock.close();
  }
  await rm(markerPath);
  return { generation: marker.generation, manifestHash };
}

/** A failed pre-cutover migration can be cancelled without deleting its backup. */
export async function cancelMigration(source: string): Promise<void> {
  try {
    const selector = z
      .object({ provider: z.string() })
      .parse(JSON.parse(await readFile(join(source, "storage.json"), "utf8")));
    if (selector.provider !== "local")
      throw new StorageError("storage_conflict");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  await rm(join(source, "storage-maintenance.json"));
}

export async function restoreStorageArchive(
  source: string,
  target: string,
): Promise<void> {
  source = resolve(source);
  target = resolve(target);
  const metadata = await verifyArchive(source);
  await emptyDirectory(target);
  const staging = await mkdtemp(
    join(dirname(target), `.${basename(target)}.restore-`),
  );
  try {
    await copyFile(
      join(source, "kamelog.sqlite"),
      join(staging, "kamelog.sqlite"),
    );
    await chmod(join(staging, "kamelog.sqlite"), 0o600);
    const from = new LocalBlobStorage(source);
    const to = new LocalBlobStorage(staging);
    for (const blob of metadata.blobs)
      await to.put(blob.key, await from.get(blob.key));
    for (const name of ["manifest.json", "migration.json"]) {
      await copyFile(join(source, name), join(staging, name));
      await chmod(join(staging, name), 0o600);
    }
    for (const name of ["kamelog.sqlite", "manifest.json", "migration.json"]) {
      const copied = await open(join(staging, name), "r");
      try {
        await copied.sync();
      } finally {
        await copied.close();
      }
    }
    // No runnable database is visible at the requested destination until every
    // copied byte and reference has passed verification. A destination that
    // became nonempty in the meantime makes rename fail without replacement.
    await verifyArchive(staging);
    await rename(staging, target);
    const parent = await open(dirname(target), "r");
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

function normalizedSql(sql: string): string {
  // Ignore formatting between SQL tokens, while preserving quoted contents.
  return sql
    .replace(
      /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|\s+/g,
      (token) => (/^\s+$/.test(token) ? " " : token),
    )
    .trim()
    .replace(/;$/, "");
}

function normalizedTables(tables: TableDescription[]): TableDescription[] {
  return tables.map((table) => ({
    ...table,
    createSql: normalizedSql(table.createSql),
  }));
}

/** Exports current cloud state under a server-side write fence to portable SQLite. */
export async function exportCloudDatabase(
  options: GatewayOptions,
  path: string,
): Promise<ArchiveMetadata> {
  const target = new GatewayMigrationTarget(options);
  const migrationId = randomUUID();
  let local: Store | undefined;
  let created = false;
  let operationFailed = false;
  const staging = join(dirname(path), `.export-${randomUUID()}`);
  try {
    const frozenRecord = z
      .object({
        ...archiveMetadataSchema.shape,
        manifestHash: z.string(),
        migrationId: z.uuid(),
      })
      .strict()
      .parse(await target.request("/migration/freeze", { migrationId }));
    const { manifestHash, migrationId: returnedId, ...metadata } = frozenRecord;
    const frozen = { metadata };
    if (
      returnedId !== migrationId ||
      archiveManifestHash(metadata) !== manifestHash
    )
      throw new StorageError("storage_integrity");
    target.setExportLease(migrationId);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const reservation = await open(path, "wx", 0o600);
    created = true;
    await reservation.close();
    // Initialize the currently supported schema rather than executing archive SQL.
    local = new Store(staging, { maintenanceBypass: true });
    const native = new DatabaseSync(join(staging, "kamelog.sqlite"));
    try {
      // Schema 12 exports remain portable before the first read-model upgrade.
      if (frozen.metadata.schemaVersion === 12) {
        native.exec(`DROP TABLE post_media_refs;
          DROP INDEX federation_deliveries_processing;
          DROP INDEX posts_blogs;
          DROP INDEX posts_federation_order;
          DELETE FROM migrations WHERE version=13;`);
      }
      const supported = describeTables(native);
      if (
        supported.length !== frozen.metadata.tables.length ||
        frozen.metadata.tables.some((table) => {
          const expected = supported.find(
            (candidate) => candidate.name === table.name,
          );
          return (
            !expected ||
            normalizedSql(expected.createSql) !==
              normalizedSql(table.createSql) ||
            JSON.stringify(expected.columns) !== JSON.stringify(table.columns)
          );
        })
      )
        throw new StorageError("storage_integrity");
      native.exec("PRAGMA foreign_keys=ON; BEGIN IMMEDIATE");
      try {
        for (const table of [...frozen.metadata.tables].reverse())
          native.exec(`DELETE FROM ${quoteIdentifier(table.name)}`);
        for (const table of frozen.metadata.tables) {
          if (table.name === "sqlite_sequence")
            native.exec("DELETE FROM sqlite_sequence");
          const insert = native.prepare(
            `INSERT INTO ${quoteIdentifier(table.name)} (${table.columns.map(quoteIdentifier).join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`,
          );
          for (let offset = 0; offset < table.count;) {
            const rows = await target.exportRows(table.name, offset, 250);
            if (!rows.length || offset + rows.length > table.count)
              throw new StorageError("storage_integrity");
            for (const row of rows) {
              canonicalRow(table.columns, row);
              insert.run(...table.columns.map((column) => row[column]));
            }
            offset += rows.length;
          }
        }
        validateDatabase(native);
        if (
          JSON.stringify(normalizedTables(describeTables(native))) !==
            JSON.stringify(normalizedTables(frozen.metadata.tables)) ||
          JSON.stringify(
            describeIndexes(native).map((index) => ({
              ...index,
              sql: normalizedSql(index.sql),
            })),
          ) !==
            JSON.stringify(
              frozen.metadata.indexes.map((index) => ({
                ...index,
                sql: normalizedSql(index.sql),
              })),
            )
        )
          throw new StorageError("storage_integrity");
        native.exec("COMMIT");
      } catch (error) {
        native.exec("ROLLBACK");
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ERR_SQLITE_ERROR"
        )
          throw new StorageError("storage_integrity");
        throw error;
      }
    } finally {
      native.close();
    }
    await local.snapshot(path);
    local.close();
    local = undefined;
    await rm(staging, { recursive: true, force: true });
    return frozen.metadata;
  } catch (error) {
    operationFailed = true;
    if (created) await rm(path, { force: true }).catch(() => {});
    throw error;
  } finally {
    let cleanupFailure: unknown;
    try {
      local?.close();
    } catch (error) {
      cleanupFailure = error;
    }
    try {
      await rm(staging, { recursive: true, force: true });
    } catch (error) {
      cleanupFailure ??= error;
    }
    try {
      // A rejected/ambiguous freeze must never unlock another owner's lease.
      // The gateway checks this ID; hard crashes recover through lease expiry.
      await target.request("/migration/unfreeze", { migrationId });
    } catch (error) {
      cleanupFailure ??= error;
    }
    // Preserve the actual export/limit error if release also fails. Conversely,
    // do not report success when a completed export could not release its lease.
    if (!operationFailed && cleanupFailure !== undefined) throw cleanupFailure;
  }
}

export async function exportCloudArchive(
  options: GatewayOptions,
  directory: string,
): Promise<void> {
  directory = resolve(directory);
  await emptyDirectory(directory);
  const temporary = join(dirname(directory), `.cloud-export-${randomUUID()}`);
  await mkdir(temporary, { mode: 0o700 });
  try {
    const metadata = await exportCloudDatabase(
      options,
      join(temporary, "kamelog.sqlite"),
    );
    const cloud = new GatewayBlobStorage(options);
    const local = new LocalBlobStorage(temporary);
    for (const blob of metadata.blobs) {
      const bytes = await cloud.get(blob.key);
      if (blobDigest(bytes) !== blob.sha256 || bytes.length !== blob.size)
        throw new StorageError("storage_integrity");
      await local.put(blob.key, bytes);
    }
    await createLocalArchive(temporary, directory);
    await verifyArchive(directory);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
