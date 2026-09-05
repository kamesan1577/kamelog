import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export class Conflict extends Error {}
export class Store {
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(this.directory, "kamelog.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS posts(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS credentials(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS challenges(id TEXT PRIMARY KEY, data TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rates(id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      INSERT OR IGNORE INTO migrations VALUES(1);`);
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES(?, ?)").run(
      "profile",
      JSON.stringify({
        name: "デモユーザー",
        icon: "🐢",
        bio: "作ったもの、考えたこと、日々の記録。",
      }),
    );
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  list(table) {
    this.table(table);
    return this.db
      .prepare(`SELECT * FROM ${table}`)
      .all()
      .map((row) => ({
        ...JSON.parse(row.data),
        id: row.id,
        ...(row.revision ? { revision: row.revision } : {}),
      }));
  }
  get(table, id) {
    this.table(table);
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
    return row
      ? {
          ...JSON.parse(row.data),
          id: row.id,
          ...(row.revision ? { revision: row.revision } : {}),
        }
      : null;
  }
  table(name) {
    if (!["posts", "drafts", "settings", "credentials", "media"].includes(name))
      throw new Error("Unknown collection");
  }
  save(table, id, value, revision) {
    this.table(table);
    if (!["posts", "drafts"].includes(table)) {
      this.db
        .prepare(
          `INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
        )
        .run(id, JSON.stringify(value));
      return this.get(table, id);
    }
    return this.transaction(() => {
      const old = this.get(table, id);
      if (old && old.revision !== revision)
        throw new Conflict("Revision conflict");
      if (!old && revision !== undefined && revision !== 0)
        throw new Conflict("Missing revision");
      const next = { ...value, id, revision: (old?.revision || 0) + 1 };
      this.db
        .prepare(
          `INSERT INTO ${table} VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, revision=excluded.revision`,
        )
        .run(id, JSON.stringify(next), next.revision);
      return next;
    });
  }
  remove(table, id, revision) {
    this.table(table);
    if (["posts", "drafts"].includes(table)) {
      const result = this.db
        .prepare(`DELETE FROM ${table} WHERE id=? AND revision=?`)
        .run(id, revision);
      if (!result.changes) throw new Conflict("Revision conflict");
    } else this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
  }
  credentials() {
    return this.list("credentials");
  }
  createSession() {
    const token = randomUUID() + randomUUID();
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?)")
      .run(hash(token), Date.now() + 12 * 3600_000);
    return token;
  }
  authenticated(token) {
    return (
      !!token &&
      !!this.db
        .prepare("SELECT id FROM sessions WHERE id=? AND expires>?")
        .get(hash(token), Date.now())
    );
  }
  logout(token) {
    if (token)
      this.db.prepare("DELETE FROM sessions WHERE id=?").run(hash(token));
  }
  resetAuthentication() {
    return this.transaction(() => {
      const credentials = this.db
        .prepare("SELECT count(*) AS count FROM credentials")
        .get().count;
      this.db.exec(
        "DELETE FROM sessions; DELETE FROM challenges; DELETE FROM credentials;",
      );
      return credentials;
    });
  }
  challenge(data) {
    const id = randomUUID();
    this.db.prepare("DELETE FROM challenges WHERE expires<?").run(Date.now());
    this.db
      .prepare("INSERT INTO challenges VALUES(?,?,?)")
      .run(hash(id), JSON.stringify(data), Date.now() + 300_000);
    return id;
  }
  consume(id) {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM challenges WHERE id=?")
        .get(hash(id || ""));
      this.db.prepare("DELETE FROM challenges WHERE id=?").run(hash(id || ""));
      return row && row.expires > Date.now() ? JSON.parse(row.data) : null;
    });
  }
  rate(key, limit = 60, window = 60_000) {
    return this.transaction(() => {
      const now = Date.now();
      this.db.prepare("DELETE FROM rates WHERE expires<=?").run(now);
      this.db
        .prepare(
          "INSERT INTO rates VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1",
        )
        .run(hash(key), now + window);
      return (
        this.db.prepare("SELECT count FROM rates WHERE id=?").get(hash(key))
          .count <= limit
      );
    });
  }
  async snapshot(path) {
    await backup(this.db, path);
  }
  close() {
    this.db.close();
  }
}
