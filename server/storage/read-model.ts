import { z } from "zod";
import type { SqlDatabase, SqlRow } from "./sql.ts";

export function replacePostMedia(
  db: SqlDatabase,
  postId: string,
  value: unknown,
) {
  const post = z
    .object({
      kind: z.string().optional(),
      body: z.string().optional(),
      video: z.string().optional(),
      images: z.array(z.string()).optional(),
    })
    .passthrough()
    .parse(value);
  const ids = new Set<string>();
  for (const path of [post.video, ...(post.images || [])]) {
    const match = /^\/api\/media\/([a-f0-9-]{36})$/.exec(path || "");
    if (match) ids.add(match[1]);
  }
  if (post.kind === "blog") {
    for (const match of (post.body || "").matchAll(
      /\/api\/media\/([a-f0-9-]{36})(?![a-f0-9-])/g,
    ))
      ids.add(match[1]);
  }
  db.prepare("DELETE FROM post_media_refs WHERE post_id=?").run(postId);
  for (const id of ids)
    db.prepare("INSERT INTO post_media_refs VALUES(?,?)").run(postId, id);
}

/** One atomic, versioned backfill. Reopening a migrated database does no scans. */
export function initializeReadModel(db: SqlDatabase) {
  const version = Number(
    db.prepare("SELECT MAX(version) AS version FROM migrations").get()?.version,
  );
  if (version === 13) return;
  if (version !== 12) throw new Error("Unsupported storage schema");
  db.transaction(() => {
    db.exec(`CREATE TABLE post_media_refs(
      post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL,
      PRIMARY KEY(post_id, media_id)
    );
    CREATE INDEX post_media_refs_media ON post_media_refs(media_id, post_id);
    CREATE INDEX federation_deliveries_processing ON federation_deliveries(state, claimed_at);
    CREATE INDEX posts_blogs ON posts(json_extract(data, '$.kind'));
    CREATE INDEX posts_federation_order ON posts(
      json_extract(data, '$.federationEnabled'),
      COALESCE(json_extract(data, '$.federationUpdatedAt'), json_extract(data, '$.updatedAt'), json_extract(data, '$.date')) DESC,
      id DESC
    );`);
    for (const row of db.prepare("SELECT id, data FROM posts").all()) {
      replacePostMedia(db, String(row.id), JSON.parse(String(row.data)));
    }
    db.prepare("INSERT INTO migrations VALUES(13)").run();
  });
}

export function postRelations(db: SqlDatabase, ids?: string[]) {
  const filter = ids
    ? " WHERE post_id IN (SELECT value FROM json_each(?))"
    : "";
  const parameters = ids ? [JSON.stringify(ids)] : [];
  const tags = new Map<string, SqlRow[]>();
  for (const row of db
    .prepare(
      `SELECT post_id, tag, source, confidence, model_version, content_hash FROM post_tags${filter} ORDER BY rowid`,
    )
    .all(...parameters)) {
    const id = String(row.post_id);
    if (!tags.has(id)) tags.set(id, []);
    tags.get(id)!.push(row);
  }
  const links = new Map(
    db
      .prepare(
        `SELECT post_id, parent_id AS parentId, state FROM inferred_thread_links${filter}`,
      )
      .all(...parameters)
      .map((row) => [String(row.post_id), row]),
  );
  return { tags, links };
}
