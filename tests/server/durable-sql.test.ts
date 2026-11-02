import assert from "node:assert/strict";
import { DatabaseSync, type SQLOutputValue } from "node:sqlite";
import test from "node:test";
import {
  DurableSqlDatabase,
  type DurableSqlStorage,
  type DurableSqlValue,
} from "../../server/storage/durable-sql.ts";
import { Store as DomainStore } from "../../server/store.mjs";

function durableValue(value: SQLOutputValue): DurableSqlValue {
  if (value instanceof Uint8Array) return Uint8Array.from(value).buffer;
  if (typeof value === "bigint") {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric))
      throw new RangeError("Unsafe fixture integer");
    return numeric;
  }
  return value;
}

function fixtureStorage() {
  const sqlite = new DatabaseSync(":memory:");
  let depth = 0;
  let transactions = 0;
  const storage: DurableSqlStorage = {
    sql: {
      exec(sql, ...parameters) {
        // Multi-statement schema setup has no parameters. Query preparation in
        // Node accepts only one statement, unlike Durable Object sql.exec.
        let values: Record<string, DurableSqlValue>[] = [];
        if (
          sql.trim().replace(/;$/, "").includes(";") &&
          parameters.length === 0
        ) {
          sqlite.exec(sql);
        } else {
          values = sqlite
            .prepare(sql)
            .all(
              ...parameters.map((value) =>
                value instanceof ArrayBuffer ? new Uint8Array(value) : value,
              ),
            )
            .map((row) =>
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                  key,
                  durableValue(value),
                ]),
              ),
            );
        }
        const changes = sqlite
          .prepare("SELECT changes() AS changes")
          .get()?.changes;
        return {
          rowsWritten: Number(changes),
          [Symbol.iterator]: () => values[Symbol.iterator](),
        };
      },
    },
    transactionSync<T>(operation: () => T): T {
      transactions += 1;
      const name = `fixture_${depth++}`;
      sqlite.exec(`SAVEPOINT ${name}`);
      try {
        const result = operation();
        sqlite.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        sqlite.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
        throw error;
      } finally {
        depth -= 1;
      }
    },
  };
  return {
    storage,
    close: () => sqlite.close(),
    transactions: () => transactions,
  };
}

test("Durable SQL adapter executes Store callbacks at the authoritative engine", () => {
  const fixture = fixtureStorage();
  const database = new DurableSqlDatabase(fixture.storage);
  const store = new DomainStore("cloud", database);
  try {
    const first = store.save("posts", "fixture", {
      kind: "tweet",
      body: "first",
      tags: [],
    });
    assert.equal(first.revision, 1);
    assert.throws(() =>
      database.transaction(() => {
        store.save(
          "posts",
          "fixture",
          { kind: "tweet", body: "rolled back", tags: [] },
          1,
        );
        throw new Error("receipt failed");
      }),
    );
    assert.equal(store.get("posts", "fixture").body, "first");
    assert.ok(fixture.transactions() >= 3);
  } finally {
    fixture.close();
  }
});

test("Durable SQL adapter preserves write counts and binary values", () => {
  const fixture = fixtureStorage();
  const database = new DurableSqlDatabase(fixture.storage);
  try {
    database.exec("CREATE TABLE fixture(id INTEGER PRIMARY KEY, payload BLOB)");
    assert.deepEqual(
      database
        .prepare("INSERT INTO fixture VALUES(?, ?)")
        .run(1, new Uint8Array([1, 2, 3])),
      { changes: 1, lastInsertRowid: 1 },
    );
    assert.equal(
      database
        .prepare("INSERT OR IGNORE INTO fixture VALUES(?, ?)")
        .run(1, null).changes,
      0,
    );
    assert.deepEqual(
      database.prepare("SELECT payload FROM fixture WHERE id=?").get(1)
        ?.payload,
      new Uint8Array([1, 2, 3]),
    );
    assert.throws(
      () =>
        database
          .prepare("INSERT INTO fixture VALUES(?, ?)")
          .run(BigInt("9007199254740992"), null),
      RangeError,
    );
  } finally {
    fixture.close();
  }
});
