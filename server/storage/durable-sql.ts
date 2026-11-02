import type { SqlDatabase, SqlRow, SqlStatement, SqlValue } from "./sql.ts";

export type DurableSqlValue = string | number | null | ArrayBuffer;
export interface DurableSqlCursor extends Iterable<
  Record<string, DurableSqlValue>
> {
  readonly rowsWritten: number;
}
export interface DurableSqlStorage {
  sql: {
    exec(sql: string, ...parameters: DurableSqlValue[]): DurableSqlCursor;
  };
  transactionSync<T>(operation: () => T): T;
}

function parameter(value: SqlValue): DurableSqlValue {
  if (typeof value === "bigint") {
    const number = Number(value);
    if (!Number.isSafeInteger(number))
      throw new RangeError("Unsafe SQLite integer");
    return number;
  }
  if (value instanceof Uint8Array) return Uint8Array.from(value).buffer;
  return value;
}

function rows(cursor: DurableSqlCursor): SqlRow[] {
  return Array.from(cursor, (row) =>
    Object.fromEntries(
      Object.entries(row).map(([name, value]) => [
        name,
        value instanceof ArrayBuffer ? new Uint8Array(value) : value,
      ]),
    ),
  );
}

/** Runs inside a SQLite-backed Durable Object, never on the Node application. */
export class DurableSqlDatabase implements SqlDatabase {
  private readonly storage: DurableSqlStorage;

  constructor(storage: DurableSqlStorage) {
    this.storage = storage;
  }

  exec(sql: string): void {
    Array.from(this.storage.sql.exec(sql));
  }

  prepare(sql: string): SqlStatement {
    const execute = (parameters: SqlValue[]) =>
      this.storage.sql.exec(sql, ...parameters.map(parameter));
    return {
      get: (...parameters) => rows(execute(parameters))[0],
      all: (...parameters) => rows(execute(parameters)),
      run: (...parameters) => {
        Array.from(execute(parameters));
        // rowsWritten includes trigger effects; changes() has the SQLite
        // semantics relied upon by likes, revision guards and queue claims.
        const result = rows(
          this.storage.sql.exec(
            "SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowid",
          ),
        )[0];
        if (
          !result ||
          typeof result.changes !== "number" ||
          typeof result.lastInsertRowid !== "number"
        )
          throw new Error("Invalid SQLite write result");
        return {
          changes: result.changes,
          lastInsertRowid: result.lastInsertRowid,
        };
      },
    };
  }

  transaction<T>(operation: () => T): T {
    return this.storage.transactionSync(() => {
      const result = operation();
      if (
        result !== null &&
        (typeof result === "object" || typeof result === "function") &&
        "then" in result
      )
        throw new TypeError("SQL transactions must be synchronous");
      return result;
    });
  }

  close(): void {
    // The Durable Object owns its SQLite lifetime.
  }
}
