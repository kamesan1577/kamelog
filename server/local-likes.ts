import type { SqlDatabase } from "./storage/sql.ts";
import type { Store } from "./store.mjs";
import { executeCommand } from "./storage/commands.ts";

export function initializeLocalLikes(db: SqlDatabase) {
  db.exec(`CREATE TABLE IF NOT EXISTS local_post_likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    client_hash TEXT NOT NULL,
    PRIMARY KEY(post_id, client_hash)
  );
  INSERT OR IGNORE INTO migrations VALUES(12);`);
}

export function setLocalLike(store: Store, postId: string, input: unknown) {
  return executeCommand(store, "localLike", [postId, input]);
}
