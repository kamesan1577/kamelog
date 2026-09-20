import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
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
        confidence REAL CHECK(confidence >= 0 AND confidence <= 1),
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
      CREATE TABLE IF NOT EXISTS inference_settings(
        id INTEGER PRIMARY KEY CHECK(id = 1),
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inference_credentials(
        provider TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        metadata TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS inference_jobs(
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL CHECK(task IN ('tag', 'thread')),
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        input_hash TEXT NOT NULL,
        engine_id TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'retry', 'processing', 'succeeded', 'abstained', 'dead', 'cancelled')),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        next_attempt_at INTEGER NOT NULL,
        last_error_code TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(task, post_id, input_hash, engine_id)
      );
      CREATE INDEX IF NOT EXISTS inference_jobs_ready
        ON inference_jobs(task, state, next_attempt_at, created_at);
      CREATE TABLE IF NOT EXISTS inference_runs(
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL CHECK(task IN ('tag', 'thread')),
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        engine_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_version TEXT,
        adapter_version TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        candidate_hash TEXT NOT NULL,
        usage TEXT,
        executed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_identity(
        id INTEGER PRIMARY KEY CHECK(id = 1),
        username TEXT NOT NULL UNIQUE,
        public_key_pem TEXT NOT NULL,
        private_key_pem TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_inbox_activities(
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL,
        received_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_followers(
        actor_id TEXT PRIMARY KEY,
        inbox_url TEXT NOT NULL,
        shared_inbox_url TEXT,
        follow_activity_id TEXT NOT NULL,
        followed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_outbound_activities(
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_deliveries(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_id TEXT NOT NULL REFERENCES federation_outbound_activities(id) ON DELETE CASCADE,
        inbox_url TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('pending', 'processing', 'succeeded', 'dead')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        claimed_at INTEGER,
        last_status INTEGER,
        last_error TEXT,
        completed_at TEXT,
        UNIQUE(activity_id, inbox_url)
      );
      CREATE INDEX IF NOT EXISTS federation_deliveries_ready
        ON federation_deliveries(state, next_attempt_at, id);
      CREATE TABLE IF NOT EXISTS federation_worker_state(
        id INTEGER PRIMARY KEY CHECK(id = 1),
        last_heartbeat_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_remote_actors(
        actor_id TEXT PRIMARY KEY,
        handle TEXT UNIQUE,
        inbox_url TEXT NOT NULL,
        shared_inbox_url TEXT,
        preferred_username TEXT NOT NULL,
        display_name TEXT NOT NULL,
        icon_url TEXT,
        fetched_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS federation_following(
        actor_id TEXT PRIMARY KEY REFERENCES federation_remote_actors(actor_id) ON DELETE CASCADE,
        state TEXT NOT NULL CHECK(state IN ('pending', 'accepted', 'rejected', 'failed')),
        follow_activity_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS federation_remote_objects(
        object_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL,
        content_html TEXT NOT NULL,
        url TEXT NOT NULL,
        published_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        attachments TEXT NOT NULL,
        received_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE TABLE IF NOT EXISTS federation_timeline_entries(
        activity_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('Create', 'Announce')),
        object_id TEXT NOT NULL REFERENCES federation_remote_objects(object_id),
        published_at TEXT NOT NULL,
        received_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS federation_timeline_order
        ON federation_timeline_entries(deleted_at, published_at DESC, activity_id);
      CREATE TABLE IF NOT EXISTS federation_remote_media(
        id TEXT PRIMARY KEY,
        object_id TEXT NOT NULL REFERENCES federation_remote_objects(object_id) ON DELETE CASCADE,
        remote_url TEXT NOT NULL,
        declared_type TEXT NOT NULL,
        cached_type TEXT,
        extension TEXT,
        size INTEGER,
        cached_at TEXT
      );
      CREATE TABLE IF NOT EXISTS federation_reposts(
        object_id TEXT PRIMARY KEY REFERENCES federation_remote_objects(object_id),
        announce_activity_id TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        undone_at TEXT
      );
      CREATE TABLE IF NOT EXISTS federation_remote_reactions(
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        actor_id TEXT NOT NULL REFERENCES federation_remote_actors(actor_id) ON DELETE CASCADE,
        activity_id TEXT NOT NULL UNIQUE,
        reaction_type TEXT NOT NULL CHECK(reaction_type IN ('Like', 'EmojiReact')),
        reacted_at TEXT NOT NULL,
        undone_at TEXT,
        PRIMARY KEY(post_id, actor_id)
      );
      INSERT OR IGNORE INTO migrations VALUES(1);
      INSERT OR IGNORE INTO migrations VALUES(2);
      INSERT OR IGNORE INTO migrations VALUES(3);
      INSERT OR IGNORE INTO migrations VALUES(4);
      INSERT OR IGNORE INTO migrations VALUES(5);
      INSERT OR IGNORE INTO migrations VALUES(6);
      INSERT OR IGNORE INTO migrations VALUES(7);
      INSERT OR IGNORE INTO migrations VALUES(8);
      INSERT OR IGNORE INTO migrations VALUES(9);`);
    const migration9 = this.db
      .prepare("SELECT 1 AS found FROM migrations WHERE version=9")
      .get();
    if (migration9) {
      const confidence = this.db
        .prepare("PRAGMA table_info(post_tags)")
        .all()
        .find(({ name }) => name === "confidence");
      if (confidence?.notnull) {
        this.transaction(() => {
          this.db.exec(`
            ALTER TABLE post_tags RENAME TO post_tags_legacy;
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
            INSERT INTO post_tags SELECT * FROM post_tags_legacy;
            DROP TABLE post_tags_legacy;
          `);
        });
      }
    }
    this.db.prepare("INSERT OR IGNORE INTO migrations VALUES(10)").run();
    this.db
      .prepare(
        `SELECT object_id AS objectId, attachments
         FROM federation_remote_objects WHERE deleted_at IS NULL`,
      )
      .all()
      .forEach(({ objectId, attachments }) => {
        for (const attachment of JSON.parse(attachments))
          this.registerFederationRemoteMedia(
            objectId,
            attachment.url,
            attachment.mediaType,
          );
      });
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
          ? `SELECT posts.*, COALESCE(post_views.count, 0) AS views,
                    (SELECT COUNT(*) FROM federation_remote_reactions reactions
                     WHERE reactions.post_id=posts.id
                       AND reactions.undone_at IS NULL) AS federation_likes
             FROM posts LEFT JOIN post_views ON post_views.post_id = posts.id`
          : `SELECT * FROM ${table}`,
      )
      .all();
    return rows.map((row) => this.#rowValue(row, table));
  }
  get(table, id) {
    this.table(table);
    const row = this.db
      .prepare(
        table === "posts"
          ? `SELECT posts.*, COALESCE(post_views.count, 0) AS views,
                    (SELECT COUNT(*) FROM federation_remote_reactions reactions
                     WHERE reactions.post_id=posts.id
                       AND reactions.undone_at IS NULL) AS federation_likes
             FROM posts LEFT JOIN post_views ON post_views.post_id = posts.id
             WHERE posts.id=?`
          : `SELECT * FROM ${table} WHERE id=?`,
      )
      .get(id);
    return row ? this.#rowValue(row, table) : null;
  }
  #rowValue(row, table) {
    const data = JSON.parse(row.data);
    return this.#withPostTags(
      {
        ...data,
        id: row.id,
        ...(row.revision ? { revision: row.revision } : {}),
        ...(table === "posts"
          ? {
              views: Number(row.views),
              likes:
                Number(data.likes || 0) + Number(row.federation_likes || 0),
            }
          : {}),
      },
      table,
    );
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
        ...(confidence === null ? {} : { confidence: Number(confidence) }),
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
  localPostLikes(id) {
    const row = this.db.prepare("SELECT data FROM posts WHERE id=?").get(id);
    return row ? Number(JSON.parse(row.data).likes || 0) : 0;
  }
  table(name) {
    if (!["posts", "drafts", "settings", "credentials", "media"].includes(name))
      throw new Error("Unknown collection");
  }
  save(table, id, value, revision, afterSave) {
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
      const saved = this.get(table, id);
      afterSave?.(saved, old);
      return saved;
    });
  }
  remove(table, id, revision, afterRemove) {
    this.table(table);
    if (["posts", "drafts"].includes(table)) {
      return this.transaction(() => {
        const old = this.get(table, id);
        const result = this.db
          .prepare(`DELETE FROM ${table} WHERE id=? AND revision=?`)
          .run(id, revision);
        if (!result.changes) throw new Conflict("Revision conflict");
        afterRemove?.(old);
      });
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
            tag.confidence ?? null,
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
  inferenceSettings() {
    const row = this.db
      .prepare("SELECT data FROM inference_settings WHERE id=1")
      .get();
    return row ? JSON.parse(row.data) : null;
  }
  saveInferenceSettings(value) {
    this.db
      .prepare(
        `INSERT INTO inference_settings(id, data) VALUES(1, ?)
         ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(JSON.stringify(value));
    return this.inferenceSettings();
  }
  hasInferenceCredential(provider) {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 AS found FROM inference_credentials WHERE provider=?",
        )
        .get(provider),
    );
  }
  inferenceCredential(provider) {
    const row = this.db
      .prepare(
        `SELECT provider, payload, metadata, updated_at AS updatedAt
         FROM inference_credentials WHERE provider=?`,
      )
      .get(provider);
    return row ? { ...row, metadata: JSON.parse(row.metadata) } : null;
  }
  saveInferenceCredential(provider, payload, metadata) {
    this.db
      .prepare(
        `INSERT INTO inference_credentials(provider, payload, metadata, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           payload=excluded.payload, metadata=excluded.metadata, updated_at=excluded.updated_at`,
      )
      .run(
        provider,
        payload,
        JSON.stringify(metadata),
        new Date().toISOString(),
      );
  }
  removeInferenceCredential(provider) {
    this.db
      .prepare("DELETE FROM inference_credentials WHERE provider=?")
      .run(provider);
  }
  federationIdentity() {
    return this.db
      .prepare(
        `SELECT username,
                public_key_pem AS publicKeyPem,
                private_key_pem AS privateKeyPem,
                created_at AS createdAt
         FROM federation_identity WHERE id=1`,
      )
      .get();
  }
  createFederationIdentity(identity) {
    return this.transaction(() => {
      if (this.federationIdentity()) throw new Conflict("Already configured");
      this.db
        .prepare(
          `INSERT INTO federation_identity
           (id, username, public_key_pem, private_key_pem, created_at)
           VALUES (1, ?, ?, ?, ?)`,
        )
        .run(
          identity.username,
          identity.publicKeyPem,
          identity.privateKeyPem,
          identity.createdAt,
        );
      return this.federationIdentity();
    });
  }
  recordFederationActivity(activity) {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO federation_inbox_activities
         (id, actor_id, type, received_at) VALUES (?, ?, ?, ?)`,
      )
      .run(activity.id, activity.actorId, activity.type, activity.receivedAt);
    return result.changes > 0;
  }
  hasFederationActivity(id) {
    return Boolean(
      this.db
        .prepare(
          "SELECT 1 AS found FROM federation_inbox_activities WHERE id=?",
        )
        .get(id),
    );
  }
  federationFollowers() {
    return this.db
      .prepare(
        `SELECT actor_id AS actorId, inbox_url AS inboxUrl,
                shared_inbox_url AS sharedInboxUrl,
                follow_activity_id AS followActivityId,
                followed_at AS followedAt
         FROM federation_followers ORDER BY followed_at DESC`,
      )
      .all();
  }
  federationFollower(actorId) {
    return (
      this.db
        .prepare(
          `SELECT actor_id AS actorId, inbox_url AS inboxUrl,
                  shared_inbox_url AS sharedInboxUrl,
                  follow_activity_id AS followActivityId,
                  followed_at AS followedAt
           FROM federation_followers WHERE actor_id=?`,
        )
        .get(actorId) || null
    );
  }
  saveFederationFollower(follower) {
    this.db
      .prepare(
        `INSERT INTO federation_followers
         (actor_id, inbox_url, shared_inbox_url, follow_activity_id, followed_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(actor_id) DO UPDATE SET
           inbox_url=excluded.inbox_url,
           shared_inbox_url=excluded.shared_inbox_url,
           follow_activity_id=excluded.follow_activity_id,
           followed_at=excluded.followed_at`,
      )
      .run(
        follower.actorId,
        follower.inboxUrl,
        follower.sharedInboxUrl || null,
        follower.followActivityId,
        follower.followedAt,
      );
    return this.federationFollower(follower.actorId);
  }
  removeFederationFollower(actorId, followActivityId) {
    const result = followActivityId
      ? this.db
          .prepare(
            "DELETE FROM federation_followers WHERE actor_id=? AND follow_activity_id=?",
          )
          .run(actorId, followActivityId)
      : this.db
          .prepare("DELETE FROM federation_followers WHERE actor_id=?")
          .run(actorId);
    return result.changes > 0;
  }
  federationFollowerInboxes() {
    return this.db
      .prepare(
        `SELECT DISTINCT COALESCE(shared_inbox_url, inbox_url) AS inboxUrl
         FROM federation_followers ORDER BY inboxUrl`,
      )
      .all()
      .map(({ inboxUrl }) => inboxUrl);
  }
  enqueueFederationActivity(activity, inboxes) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO federation_outbound_activities
         (id, type, object_id, body, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        activity.id,
        activity.type,
        activity.objectId,
        JSON.stringify(activity.body),
        activity.createdAt,
      );
    const enqueue = this.db.prepare(
      `INSERT OR IGNORE INTO federation_deliveries
       (activity_id, inbox_url, state, attempts, next_attempt_at)
       VALUES (?, ?, 'pending', 0, ?)`,
    );
    for (const inbox of new Set(inboxes))
      enqueue.run(activity.id, inbox, activity.nextAttemptAt ?? Date.now());
  }
  federationOutboundActivity(id) {
    const row = this.db
      .prepare(
        `SELECT id, type, object_id AS objectId, body, created_at AS createdAt
         FROM federation_outbound_activities WHERE id=?`,
      )
      .get(id);
    return row ? { ...row, body: JSON.parse(row.body) } : null;
  }
  federationOutboxActivities(limit = 100) {
    return this.db
      .prepare(
        `SELECT body FROM federation_outbound_activities
         ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(Math.max(1, Math.min(100, limit)))
      .map(({ body }) => JSON.parse(body));
  }
  saveFederationRemoteActor(actor) {
    this.db
      .prepare(
        `INSERT INTO federation_remote_actors
         (actor_id, handle, inbox_url, shared_inbox_url, preferred_username,
          display_name, icon_url, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(actor_id) DO UPDATE SET
           handle=COALESCE(excluded.handle, federation_remote_actors.handle),
           inbox_url=excluded.inbox_url,
           shared_inbox_url=excluded.shared_inbox_url,
           preferred_username=excluded.preferred_username,
           display_name=excluded.display_name,
           icon_url=excluded.icon_url,
           fetched_at=excluded.fetched_at`,
      )
      .run(
        actor.actorId,
        actor.handle || null,
        actor.inboxUrl,
        actor.sharedInboxUrl || null,
        actor.preferredUsername,
        actor.displayName,
        actor.iconUrl || null,
        actor.fetchedAt,
      );
    return this.federationRemoteActor(actor.actorId);
  }
  federationRemoteActor(actorId) {
    return (
      this.db
        .prepare(
          `SELECT actor_id AS actorId, handle, inbox_url AS inboxUrl,
                  shared_inbox_url AS sharedInboxUrl,
                  preferred_username AS preferredUsername,
                  display_name AS displayName, icon_url AS iconUrl,
                  fetched_at AS fetchedAt
           FROM federation_remote_actors WHERE actor_id=?`,
        )
        .get(actorId) || null
    );
  }
  saveFederationFollowing(following) {
    this.db
      .prepare(
        `INSERT INTO federation_following
         (actor_id, state, follow_activity_id, created_at, updated_at, last_error)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(actor_id) DO UPDATE SET
           state=excluded.state,
           follow_activity_id=excluded.follow_activity_id,
           updated_at=excluded.updated_at,
           last_error=excluded.last_error`,
      )
      .run(
        following.actorId,
        following.state,
        following.followActivityId,
        following.createdAt,
        following.updatedAt,
        following.lastError || null,
      );
    return this.federationFollowing(following.actorId);
  }
  federationFollowing(actorId) {
    return (
      this.db
        .prepare(
          `SELECT following.actor_id AS actorId, actors.handle,
                  actors.preferred_username AS preferredUsername,
                  actors.display_name AS displayName,
                  actors.icon_url AS iconUrl,
                  following.state,
                  following.follow_activity_id AS followActivityId,
                  following.created_at AS createdAt,
                  following.updated_at AS updatedAt,
                  following.last_error AS lastError
           FROM federation_following following
           JOIN federation_remote_actors actors ON actors.actor_id=following.actor_id
           WHERE following.actor_id=?`,
        )
        .get(actorId) || null
    );
  }
  federationFollowingList() {
    return this.db
      .prepare(
        `SELECT following.actor_id AS actorId, actors.handle,
                actors.preferred_username AS preferredUsername,
                actors.display_name AS displayName,
                actors.icon_url AS iconUrl, following.state,
                following.follow_activity_id AS followActivityId,
                following.created_at AS createdAt,
                following.updated_at AS updatedAt,
                following.last_error AS lastError
         FROM federation_following following
         JOIN federation_remote_actors actors ON actors.actor_id=following.actor_id
         ORDER BY following.created_at DESC`,
      )
      .all();
  }
  updateFederationFollowingState(actorId, followActivityId, state, now) {
    const result = this.db
      .prepare(
        `UPDATE federation_following SET state=?, updated_at=?, last_error=NULL
         WHERE actor_id=? AND follow_activity_id=?`,
      )
      .run(state, now, actorId, followActivityId);
    return result.changes > 0;
  }
  removeFederationFollowing(actorId) {
    return (
      this.db
        .prepare("DELETE FROM federation_following WHERE actor_id=?")
        .run(actorId).changes > 0
    );
  }
  saveFederationRemoteObject(object) {
    const existing = this.federationRemoteObject(object.objectId);
    if (existing && existing.actorId !== object.actorId) return false;
    if (existing) this.invalidateFederationRemoteMedia(object.objectId);
    this.db
      .prepare(
        `INSERT INTO federation_remote_objects
         (object_id, actor_id, type, content_html, url, published_at, updated_at,
          attachments, received_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(object_id) DO UPDATE SET
           type=excluded.type,
           content_html=excluded.content_html,
           url=excluded.url,
           published_at=excluded.published_at,
           updated_at=excluded.updated_at,
           attachments=excluded.attachments,
           received_at=excluded.received_at,
           deleted_at=NULL`,
      )
      .run(
        object.objectId,
        object.actorId,
        object.type,
        object.contentHtml,
        object.url,
        object.publishedAt,
        object.updatedAt,
        JSON.stringify(object.attachments || []),
        object.receivedAt,
      );
    for (const attachment of object.attachments || [])
      this.registerFederationRemoteMedia(
        object.objectId,
        attachment.url,
        attachment.mediaType,
      );
    return true;
  }
  federationRemoteObject(objectId) {
    const row = this.db
      .prepare(
        `SELECT object_id AS objectId, actor_id AS actorId, type,
                content_html AS contentHtml, url, published_at AS publishedAt,
                updated_at AS updatedAt, attachments,
                received_at AS receivedAt, deleted_at AS deletedAt
         FROM federation_remote_objects WHERE object_id=?`,
      )
      .get(objectId);
    return row ? { ...row, attachments: JSON.parse(row.attachments) } : null;
  }
  deleteFederationRemoteObject(objectId, actorId, now) {
    const result = this.db
      .prepare(
        `UPDATE federation_remote_objects SET deleted_at=?, received_at=?
         WHERE object_id=? AND actor_id=? AND deleted_at IS NULL`,
      )
      .run(now, now, objectId, actorId);
    if (result.changes) {
      this.db
        .prepare(
          `UPDATE federation_timeline_entries SET deleted_at=?
           WHERE object_id=? AND deleted_at IS NULL`,
        )
        .run(now, objectId);
      this.invalidateFederationRemoteMedia(objectId);
    }
    return result.changes > 0;
  }
  saveFederationTimelineEntry(entry) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO federation_timeline_entries
         (activity_id, actor_id, type, object_id, published_at, received_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        entry.activityId,
        entry.actorId,
        entry.type,
        entry.objectId,
        entry.publishedAt,
        entry.receivedAt,
      );
  }
  federationTimeline(limit = 50) {
    return this.db
      .prepare(
        `SELECT entries.activity_id AS activityId,
                entries.actor_id AS actorId,
                entries.type AS activityType,
                entries.published_at AS activityPublishedAt,
                actors.handle, actors.preferred_username AS preferredUsername,
                actors.display_name AS displayName, actors.icon_url AS iconUrl,
                objects.object_id AS objectId, objects.type,
                objects.content_html AS contentHtml, objects.url,
                objects.published_at AS publishedAt,
                objects.updated_at AS updatedAt, objects.attachments,
                CASE WHEN reposts.object_id IS NULL THEN 0 ELSE 1 END AS reposted
         FROM federation_timeline_entries entries
         JOIN federation_remote_objects objects
           ON objects.object_id=entries.object_id
         JOIN federation_remote_actors actors
           ON actors.actor_id=entries.actor_id
         JOIN federation_following following
           ON following.actor_id=entries.actor_id
         LEFT JOIN federation_reposts reposts
           ON reposts.object_id=objects.object_id AND reposts.undone_at IS NULL
         WHERE entries.deleted_at IS NULL AND objects.deleted_at IS NULL
           AND following.state='accepted'
         ORDER BY entries.published_at DESC, entries.activity_id DESC
         LIMIT ?`,
      )
      .all(Math.max(1, Math.min(5_000, Number(limit) || 50)))
      .map((row) => ({
        ...row,
        attachments: JSON.parse(row.attachments),
      }));
  }
  registerFederationRemoteMedia(objectId, remoteUrl, declaredType) {
    const id = hash(`${objectId}\0${remoteUrl}`);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO federation_remote_media
         (id, object_id, remote_url, declared_type)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, objectId, remoteUrl, declaredType);
    return id;
  }
  invalidateFederationRemoteMedia(objectId) {
    const files = this.db
      .prepare(
        "SELECT id, extension FROM federation_remote_media WHERE object_id=?",
      )
      .all(objectId);
    this.db
      .prepare("DELETE FROM federation_remote_media WHERE object_id=?")
      .run(objectId);
    for (const file of files)
      if (
        /^[a-f0-9]{64}$/.test(file.id) &&
        /^(png|jpg|webp|gif)$/.test(file.extension || "")
      )
        try {
          rmSync(
            join(
              this.directory,
              "federation-media",
              `${file.id}.${file.extension}`,
            ),
            { force: true },
          );
        } catch {
          // A stale cache file is inaccessible and can be evicted later.
        }
  }
  federationRemoteMedia(id) {
    return (
      this.db
        .prepare(
          `SELECT media.id, media.object_id AS objectId,
                  media.remote_url AS remoteUrl,
                  media.declared_type AS declaredType,
                  media.cached_type AS cachedType, media.extension,
                  media.size, media.cached_at AS cachedAt
           FROM federation_remote_media media
           JOIN federation_remote_objects objects
             ON objects.object_id=media.object_id
           WHERE media.id=? AND objects.deleted_at IS NULL`,
        )
        .get(id) || null
    );
  }
  federationRemoteMediaIsPublic(id) {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 AS found
           FROM federation_remote_media media
           JOIN federation_reposts reposts
             ON reposts.object_id=media.object_id
           JOIN federation_remote_objects objects
             ON objects.object_id=media.object_id
           WHERE media.id=? AND reposts.undone_at IS NULL
             AND objects.deleted_at IS NULL`,
        )
        .get(id),
    );
  }
  cacheFederationRemoteMedia(id, metadata) {
    this.db
      .prepare(
        `UPDATE federation_remote_media
         SET cached_type=?, extension=?, size=?, cached_at=?
         WHERE id=?`,
      )
      .run(
        metadata.type,
        metadata.extension,
        metadata.size,
        metadata.cachedAt,
        id,
      );
    return this.federationRemoteMedia(id);
  }
  undoFederationTimelineEntry(activityId, actorId, now) {
    return (
      this.db
        .prepare(
          `UPDATE federation_timeline_entries SET deleted_at=?
           WHERE activity_id=? AND actor_id=? AND deleted_at IS NULL`,
        )
        .run(now, activityId, actorId).changes > 0
    );
  }
  canRepostFederationObject(objectId) {
    return Boolean(
      this.db
        .prepare(
          `SELECT 1 AS found
           FROM federation_remote_objects objects
           JOIN federation_timeline_entries entries
             ON entries.object_id=objects.object_id
           JOIN federation_following following
             ON following.actor_id=entries.actor_id
           WHERE objects.object_id=? AND objects.deleted_at IS NULL
             AND entries.deleted_at IS NULL AND following.state='accepted'
           LIMIT 1`,
        )
        .get(objectId),
    );
  }
  saveFederationRepost(repost) {
    this.db
      .prepare(
        `INSERT INTO federation_reposts
         (object_id, announce_activity_id, created_at, undone_at)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(object_id) DO UPDATE SET
           announce_activity_id=excluded.announce_activity_id,
           created_at=excluded.created_at,
           undone_at=NULL`,
      )
      .run(repost.objectId, repost.announceActivityId, repost.createdAt);
    return this.federationRepost(repost.objectId);
  }
  federationRepost(objectId) {
    return (
      this.db
        .prepare(
          `SELECT object_id AS objectId,
                  announce_activity_id AS announceActivityId,
                  created_at AS createdAt, undone_at AS undoneAt
           FROM federation_reposts WHERE object_id=?`,
        )
        .get(objectId) || null
    );
  }
  undoFederationRepost(objectId, now) {
    return (
      this.db
        .prepare(
          `UPDATE federation_reposts SET undone_at=?
           WHERE object_id=? AND undone_at IS NULL`,
        )
        .run(now, objectId).changes > 0
    );
  }
  federationPublicReposts() {
    return this.db
      .prepare(
        `SELECT reposts.object_id AS objectId,
                reposts.announce_activity_id AS announceActivityId,
                reposts.created_at AS createdAt,
                objects.actor_id AS actorId, objects.content_html AS contentHtml,
                objects.url, objects.published_at AS publishedAt,
                objects.attachments, actors.handle,
                actors.preferred_username AS preferredUsername,
                actors.display_name AS displayName
         FROM federation_reposts reposts
         JOIN federation_remote_objects objects
           ON objects.object_id=reposts.object_id
         LEFT JOIN federation_remote_actors actors
           ON actors.actor_id=objects.actor_id
         WHERE reposts.undone_at IS NULL AND objects.deleted_at IS NULL
         ORDER BY reposts.created_at DESC`,
      )
      .all()
      .map((row) => ({
        ...row,
        attachments: JSON.parse(row.attachments),
      }));
  }
  saveFederationRemoteReaction(reaction) {
    this.db
      .prepare(
        `INSERT INTO federation_remote_reactions
         (post_id, actor_id, activity_id, reaction_type, reacted_at, undone_at)
         VALUES (?, ?, ?, ?, ?, NULL)
         ON CONFLICT(post_id, actor_id) DO UPDATE SET
           activity_id=excluded.activity_id,
           reaction_type=excluded.reaction_type,
           reacted_at=excluded.reacted_at,
           undone_at=NULL`,
      )
      .run(
        reaction.postId,
        reaction.actorId,
        reaction.activityId,
        reaction.type,
        reaction.reactedAt,
      );
  }
  undoFederationRemoteReaction(activityId, actorId, now) {
    return (
      this.db
        .prepare(
          `UPDATE federation_remote_reactions SET undone_at=?
           WHERE activity_id=? AND actor_id=? AND undone_at IS NULL`,
        )
        .run(now, activityId, actorId).changes > 0
    );
  }
  federationRemoteReactionCount(postId) {
    return Number(
      this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM federation_remote_reactions
           WHERE post_id=? AND undone_at IS NULL`,
        )
        .get(postId).count,
    );
  }
  claimFederationDelivery(now = Date.now(), staleAfterMs = 5 * 60_000) {
    return this.transaction(() => {
      this.db
        .prepare(
          `UPDATE federation_deliveries
           SET state='pending', claimed_at=NULL, next_attempt_at=?
           WHERE state='processing' AND claimed_at<?`,
        )
        .run(now, now - staleAfterMs);
      const candidate = this.db
        .prepare(
          `SELECT id FROM federation_deliveries
           WHERE state='pending' AND next_attempt_at<=?
           ORDER BY next_attempt_at, id LIMIT 1`,
        )
        .get(now);
      if (!candidate) return null;
      this.db
        .prepare(
          `UPDATE federation_deliveries
           SET state='processing', claimed_at=?, attempts=attempts+1
           WHERE id=? AND state='pending'`,
        )
        .run(now, candidate.id);
      return this.db
        .prepare(
          `SELECT deliveries.id, deliveries.inbox_url AS inboxUrl,
                  deliveries.attempts, activities.id AS activityId,
                  activities.type, activities.object_id AS objectId,
                  activities.body
           FROM federation_deliveries deliveries
           JOIN federation_outbound_activities activities
             ON activities.id=deliveries.activity_id
           WHERE deliveries.id=?`,
        )
        .get(candidate.id);
    });
  }
  completeFederationDelivery(id, status, now = new Date()) {
    this.db
      .prepare(
        `UPDATE federation_deliveries
         SET state='succeeded', last_status=?, last_error=NULL,
             completed_at=?, claimed_at=NULL
         WHERE id=? AND state='processing'`,
      )
      .run(status, now.toISOString(), id);
  }
  failFederationDelivery(
    id,
    {
      status = null,
      error = "delivery failed",
      now = Date.now(),
      maxAttempts = 8,
    },
  ) {
    const delivery = this.db
      .prepare("SELECT attempts FROM federation_deliveries WHERE id=?")
      .get(id);
    if (!delivery) return null;
    const retryable =
      status === null || status === 408 || status === 429 || status >= 500;
    const dead = !retryable || delivery.attempts >= maxAttempts;
    const backoff = Math.min(6 * 60 * 60_000, 5_000 * 2 ** delivery.attempts);
    this.db
      .prepare(
        `UPDATE federation_deliveries
         SET state=?, next_attempt_at=?, claimed_at=NULL,
             last_status=?, last_error=?
         WHERE id=? AND state='processing'`,
      )
      .run(
        dead ? "dead" : "pending",
        dead ? now : now + backoff,
        status,
        String(error).slice(0, 240),
        id,
      );
    if (dead)
      this.db
        .prepare(
          `UPDATE federation_following
           SET state='failed', updated_at=?, last_error=?
           WHERE follow_activity_id=(
             SELECT activities.id
             FROM federation_deliveries deliveries
             JOIN federation_outbound_activities activities
               ON activities.id=deliveries.activity_id
             WHERE deliveries.id=? AND activities.type='Follow'
           )`,
        )
        .run(new Date(now).toISOString(), String(error).slice(0, 240), id);
    return { dead, nextAttemptAt: dead ? null : now + backoff };
  }
  federationDiagnostics(now = Date.now()) {
    const counts = Object.fromEntries(
      this.db
        .prepare(
          "SELECT state, count(*) AS count FROM federation_deliveries GROUP BY state",
        )
        .all()
        .map(({ state, count }) => [state, Number(count)]),
    );
    const lastInbox = this.db
      .prepare(
        "SELECT received_at AS receivedAt FROM federation_inbox_activities ORDER BY received_at DESC LIMIT 1",
      )
      .get();
    const worker = this.db
      .prepare(
        "SELECT last_heartbeat_at AS lastHeartbeatAt FROM federation_worker_state WHERE id=1",
      )
      .get();
    const heartbeat = worker?.lastHeartbeatAt || null;
    return {
      pendingDeliveries: (counts.pending || 0) + (counts.processing || 0),
      failedDeliveries: counts.dead || 0,
      followerCount: this.federationFollowers().length,
      followingCount: this.federationFollowingList().filter(
        ({ state }) => state === "accepted",
      ).length,
      lastInboxAt: lastInbox?.receivedAt || null,
      worker: {
        healthy: Boolean(heartbeat && now - Date.parse(heartbeat) < 30_000),
        lastHeartbeatAt: heartbeat,
      },
    };
  }
  heartbeatFederationWorker(now = new Date()) {
    this.db
      .prepare(
        `INSERT INTO federation_worker_state(id, last_heartbeat_at) VALUES(1, ?)
         ON CONFLICT(id) DO UPDATE SET last_heartbeat_at=excluded.last_heartbeat_at`,
      )
      .run(now.toISOString());
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
      .run(hash(token), Date.now() + SESSION_TTL_MS);
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
