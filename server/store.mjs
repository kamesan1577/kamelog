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
      CREATE TABLE IF NOT EXISTS post_views(
        post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        count INTEGER NOT NULL CHECK(count >= 0)
      );
      CREATE TABLE IF NOT EXISTS post_tags(
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('manual', 'auto')),
        confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
        model_version TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        training_hash TEXT NOT NULL,
        PRIMARY KEY(post_id, tag, source)
      );
      CREATE TABLE IF NOT EXISTS post_tag_runs(
        post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
        content_hash TEXT NOT NULL,
        model_version TEXT NOT NULL,
        training_hash TEXT NOT NULL
      );
      INSERT OR IGNORE INTO migrations VALUES(1);
      INSERT OR IGNORE INTO migrations VALUES(2);
      INSERT OR IGNORE INTO migrations VALUES(3);`);
    this.db
      .prepare("SELECT id, data FROM posts")
      .all()
      .forEach(({ id, data }) => {
        const post = JSON.parse(data);
        for (const tag of post.tags || [])
          this.db
            .prepare(
              `INSERT OR IGNORE INTO post_tags
               (post_id, tag, source, confidence, model_version, content_hash, training_hash)
               VALUES (?, ?, 'manual', 1, 'manual', '', '')`,
            )
            .run(id, tag);
      });
    this.db.prepare("INSERT OR IGNORE INTO settings VALUES(?, ?)").run(
      "profile",
      JSON.stringify({
        name: "かめさん",
        icon: "🐢",
        bio: "つくったものと日々の記録。",
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
    const rows = this.db
      .prepare(
        table === "posts"
          ? `SELECT posts.*, COALESCE(post_views.count, 0) AS views
             FROM posts LEFT JOIN post_views ON post_views.post_id = posts.id`
          : `SELECT * FROM ${table}`,
      )
      .all();
    return rows.map((row) =>
      this.#withPostTags(
        {
          ...JSON.parse(row.data),
          id: row.id,
          ...(row.revision ? { revision: row.revision } : {}),
          ...(table === "posts" ? { views: Number(row.views) } : {}),
        },
        table,
      ),
    );
  }
  get(table, id) {
    this.table(table);
    const row = this.db
      .prepare(
        table === "posts"
          ? `SELECT posts.*, COALESCE(post_views.count, 0) AS views
             FROM posts LEFT JOIN post_views ON post_views.post_id = posts.id
             WHERE posts.id=?`
          : `SELECT * FROM ${table} WHERE id=?`,
      )
      .get(id);
    return row
      ? this.#withPostTags(
          {
            ...JSON.parse(row.data),
            id: row.id,
            ...(row.revision ? { revision: row.revision } : {}),
            ...(table === "posts" ? { views: Number(row.views) } : {}),
          },
          table,
        )
      : null;
  }
  #withPostTags(value, table) {
    if (table !== "posts") return value;
    const rows = this.db
      .prepare(
        "SELECT tag, source, confidence, model_version, content_hash FROM post_tags WHERE post_id=? ORDER BY rowid",
      )
      .all(value.id);
    const manual = rows
      .filter((row) => row.source === "manual")
      .map((row) => row.tag);
    const fallbackManual = manual.length ? manual : value.tags || [];
    const autoTags = rows
      .filter((row) => row.source === "auto")
      .map(({ tag, confidence, model_version, content_hash }) => ({
        tag,
        confidence: Number(confidence),
        modelVersion: model_version,
        contentHash: content_hash,
      }));
    return {
      ...value,
      tags: [
        ...fallbackManual,
        ...autoTags
          .map(({ tag }) => tag)
          .filter((tag) => !fallbackManual.includes(tag)),
      ],
      ...(autoTags.length ? { autoTags } : {}),
    };
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
      let persisted = value;
      if (table === "posts" && old?.kind === "blog" && value.kind === "blog") {
        const contentChanged =
          old.title !== value.title || old.body !== value.body;
        persisted = {
          ...value,
          ...(old.updatedAt ? { updatedAt: old.updatedAt } : {}),
          ...(contentChanged ? { updatedAt: new Date().toISOString() } : {}),
        };
      }
      const next = {
        ...persisted,
        id,
        revision: (old?.revision || 0) + 1,
      };
      this.db
        .prepare(
          `INSERT INTO ${table} VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, revision=excluded.revision`,
        )
        .run(id, JSON.stringify(next), next.revision);
      if (table === "posts") {
        this.db
          .prepare("DELETE FROM post_tags WHERE post_id=? AND source='manual'")
          .run(id);
        for (const tag of next.tags || [])
          this.db
            .prepare(
              `INSERT INTO post_tags
               (post_id, tag, source, confidence, model_version, content_hash, training_hash)
               VALUES (?, ?, 'manual', 1, 'manual', '', '')`,
            )
            .run(id, tag);
      }
      return this.get(table, id);
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
  recordView(id) {
    return this.transaction(() => {
      if (!this.get("posts", id)) return null;
      this.db
        .prepare(
          `INSERT INTO post_views(post_id,count) VALUES(?,1)
           ON CONFLICT(post_id) DO UPDATE SET count=count+1`,
        )
        .run(id);
      return this.get("posts", id);
    });
  }
  autoTagState(id) {
    return (
      this.db.prepare("SELECT * FROM post_tag_runs WHERE post_id=?").get(id) ||
      null
    );
  }
  replaceAutoTags(id, tags, run) {
    return this.transaction(() => {
      if (!this.db.prepare("SELECT id FROM posts WHERE id=?").get(id))
        return null;
      this.db
        .prepare("DELETE FROM post_tags WHERE post_id=? AND source='auto'")
        .run(id);
      for (const tag of tags)
        this.db
          .prepare(
            `INSERT INTO post_tags
             (post_id, tag, source, confidence, model_version, content_hash, training_hash)
             VALUES (?, ?, 'auto', ?, ?, ?, ?)`,
          )
          .run(
            id,
            tag.tag,
            tag.confidence,
            run.modelVersion,
            run.contentHash,
            run.trainingHash,
          );
      this.db
        .prepare(
          `INSERT INTO post_tag_runs(post_id, content_hash, model_version, training_hash)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(post_id) DO UPDATE SET
             content_hash=excluded.content_hash,
             model_version=excluded.model_version,
             training_hash=excluded.training_hash`,
        )
        .run(id, run.contentHash, run.modelVersion, run.trainingHash);
      return this.get("posts", id);
    });
  }
  schemaVersion() {
    return Number(
      this.db.prepare("SELECT MAX(version) AS version FROM migrations").get()
        .version,
    );
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
