import { randomUUID } from "node:crypto";
import { hash } from "./store.mjs";

/** Persistence boundary for source-labelled tags, independent of inference. */
export class TagRepository {
  constructor(store) {
    this.store = store;
  }

  manualTags() {
    const map = new Map();
    for (const row of this.store.db
      .prepare("SELECT post_id, tag FROM post_tags WHERE source='manual' ORDER BY tag")
      .all()) {
      if (!map.has(row.post_id)) map.set(row.post_id, []);
      map.get(row.post_id).push(row.tag);
    }
    return map;
  }

  aliases() {
    // Optional owner-maintained dictionary, stored alongside other settings.
    // Neither automatic tags nor unknown names create entries here.
    const value = this.store.get("settings", "tag-aliases");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  replace(postId, tags, run) {
    return this.store.transaction(() => {
      const row = this.store.db
        .prepare("SELECT data FROM posts WHERE id=?")
        .get(postId);
      if (!row) return false;
      const post = JSON.parse(row.data);
      if (hash(`${post.title || ""}\n${post.body || ""}`) !== run.contentHash)
        return false;
      const manual = this.store.db
        .prepare("SELECT tag FROM post_tags WHERE post_id=? AND source='manual' ORDER BY tag")
        .all(postId)
        .map(({ tag }) => tag);
      if (JSON.stringify(manual) !== JSON.stringify([...run.manualTags].sort()))
        return false;
      // The owner can disable Jev while an HTTP request is in flight.
      if (run.requireEnabled && !this.store.inferenceSettings()?.autoTagEnabled)
        return false;
      this.store.db
        .prepare("DELETE FROM post_tags WHERE post_id=? AND source='auto'")
        .run(postId);
      const insert = this.store.db.prepare(
        `INSERT INTO post_tags
         (post_id, tag, source, confidence, model_version, content_hash, training_hash)
         VALUES (?, ?, 'auto', NULL, ?, ?, ?)`,
      );
      for (const { tag } of tags)
        if (!manual.includes(tag))
          insert.run(postId, tag, run.modelVersion, run.contentHash, run.trainingHash);
      this.store.db
        .prepare(
          `INSERT INTO post_tag_runs(post_id, content_hash, model_version, training_hash)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(post_id) DO UPDATE SET
             content_hash=excluded.content_hash,
             model_version=excluded.model_version,
             training_hash=excluded.training_hash`,
        )
        .run(postId, run.contentHash, run.modelVersion, run.trainingHash);
      this.store.db
        .prepare(
          `INSERT INTO inference_runs
           (id, task, post_id, engine_id, provider_id, model_version,
            adapter_version, input_hash, candidate_hash, usage, executed_at)
           VALUES (?, 'tag', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(
          randomUUID(),
          postId,
          run.engineId,
          run.providerId,
          run.modelVersion,
          run.adapterVersion,
          run.contentHash,
          run.candidateHash,
          new Date().toISOString(),
        );
      return true;
    });
  }
}
