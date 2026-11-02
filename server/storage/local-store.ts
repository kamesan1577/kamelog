import { lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { Store as DomainStore } from "../store.mjs";
import type { SqlDatabase, SqlStatement } from "./sql.ts";
import { StorageError } from "./errors.ts";

export { Conflict, hash, SESSION_TTL_SECONDS } from "../store.mjs";

/** Node's local SQLite adapter. Cloud adapters must not import this module. */
export class LocalSqlDatabase implements SqlDatabase {
  private readonly database: DatabaseSync;
  private readonly checkAccess: () => void;
  private transactionActive = false;

  constructor(path: string, checkAccess: () => void = () => {}) {
    checkAccess();
    this.checkAccess = checkAccess;
    this.database = new DatabaseSync(path);
    this.database.exec(
      "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
    );
  }

  exec(sql: string): void {
    this.execute(() => this.database.exec(sql));
  }

  prepare(sql: string): SqlStatement {
    this.checkAccess();
    const statement = this.database.prepare(sql);
    // A statement may have been prepared before migration began. The fence
    // belongs at execution time as well as at construction/preparation time.
    return {
      get: (...parameters) => this.execute(() => statement.get(...parameters)),
      all: (...parameters) => this.execute(() => statement.all(...parameters)),
      run: (...parameters) => this.execute(() => statement.run(...parameters)),
    };
  }

  transaction<T>(operation: () => T): T {
    if (this.transactionActive)
      throw new Error("Nested local SQL transactions are not supported");
    this.checkAccess();
    this.database.exec("BEGIN IMMEDIATE");
    this.transactionActive = true;
    try {
      // A process that was waiting for the SQLite lock must recheck the fence
      // after acquiring it, so it cannot write after the migration snapshot.
      this.checkAccess();
      const result = operation();
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result
      )
        throw new TypeError("SQL transactions must be synchronous");
      this.checkAccess();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionActive = false;
    }
  }

  private execute<T>(operation: () => T): T {
    if (!this.transactionActive) return this.transaction(operation);
    this.checkAccess();
    return operation();
  }

  async snapshot(path: string): Promise<void> {
    this.checkAccess();
    await backup(this.database, path);
    this.checkAccess();
  }

  close(): void {
    this.database.close();
  }
}

export interface LocalStoreOptions {
  /** Restricted to offline migration/restore tools operating under a fence. */
  maintenanceBypass?: boolean;
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function assertLocalStorageActive(directory: string): void {
  try {
    lstatSync(join(directory, "storage-maintenance.json"));
  } catch (error) {
    if (!missingFile(error)) throw new StorageError("storage_configuration");
    try {
      const value: unknown = JSON.parse(
        readFileSync(join(directory, "storage.json"), "utf8"),
      );
      if (
        !value ||
        typeof value !== "object" ||
        !("provider" in value) ||
        value.provider !== "local"
      )
        throw new StorageError("storage_configuration");
    } catch (selectorError) {
      if (missingFile(selectorError)) return;
      throw new StorageError("storage_configuration");
    }
    return;
  }
  throw new StorageError("storage_migrating");
}

/** Filesystem-backed store used by the default local provider and offline tools. */
export class Store extends DomainStore {
  constructor(directory: string, options: LocalStoreOptions = {}) {
    const root = resolve(directory);
    const checkAccess = options.maintenanceBypass
      ? () => {}
      : () => assertLocalStorageActive(root);
    checkAccess();
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const database = new LocalSqlDatabase(
      join(root, "kamelog.sqlite"),
      checkAccess,
    );
    try {
      super(root, database, {
        deleteFederationMedia(id: string, extension: string) {
          rmSync(join(root, "federation-media", `${id}.${extension}`), {
            force: true,
          });
        },
      });
    } catch (error) {
      database.close();
      throw error;
    }
  }
}
