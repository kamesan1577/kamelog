import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Store } from "./store.mjs";

const likeSchema = z
  .object({ clientId: z.uuid(), liked: z.boolean() })
  .strict();

export function initializeLocalLikes(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS local_post_likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    client_hash TEXT NOT NULL,
    PRIMARY KEY(post_id, client_hash)
  );
  INSERT OR IGNORE INTO migrations VALUES(12);`);
}

export function setLocalLike(store: Store, postId: string, input: unknown) {
  const { clientId, liked } = likeSchema.parse(input);
  // A post-scoped hash avoids retaining an identifier shared across posts.
  const clientHash = createHash("sha256")
    .update(`${postId}:${clientId.toLowerCase()}`)
    .digest("hex");
  return store.transaction(() => {
    if (!store.get("posts", postId)) return null;
    const result = liked
      ? store.db
          .prepare(
            "INSERT OR IGNORE INTO local_post_likes(post_id, client_hash) VALUES(?, ?)",
          )
          .run(postId, clientHash)
      : store.db
          .prepare(
            "DELETE FROM local_post_likes WHERE post_id=? AND client_hash=?",
          )
          .run(postId, clientHash);
    if (result.changes) {
      // Update only the local counter; do not invalidate an editor's revision or
      // copy the projected (federated + local) total back into stored JSON.
      store.db
        .prepare(
          `UPDATE posts SET data=json_set(data, '$.likes',
        MAX(0, COALESCE(json_extract(data, '$.likes'), 0) + ?)) WHERE id=?`,
        )
        .run(liked ? 1 : -1, postId);
    }
    return store.get("posts", postId);
  });
}
