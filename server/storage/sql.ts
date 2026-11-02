/** The synchronous SQL operations used by the domain store.
 *
 * Engines must execute transaction callbacks on the database host. Sending each
 * statement in a callback as a separate remote request is not an implementation
 * of this contract.
 */
export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlRow = Record<string, SqlValue>;

export interface SqlStatement {
  get(...parameters: SqlValue[]): SqlRow | undefined;
  all(...parameters: SqlValue[]): SqlRow[];
  run(...parameters: SqlValue[]): {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  };
}

export interface SqlDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqlStatement;
  transaction<T>(operation: () => T): T;
  snapshot?(path: string): Promise<void>;
  close(): void;
}

export interface StoreHooks {
  /** Existing verified remote schemas must not rerun bootstrap scans on each wake. */
  initialize?: boolean;
  /** Cache files have no authority; an inaccessible stale file may be evicted later. */
  deleteFederationMedia?(id: string, extension: string): void;
}
