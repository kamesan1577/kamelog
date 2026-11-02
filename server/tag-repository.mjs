import { executeCommand } from "./storage/commands.ts";

/** Persistence boundary for source-labelled tags, independent of inference. */
export class TagRepository {
  constructor(store) {
    this.store = store;
  }

  manualTags() {
    const map = new Map();
    for (const row of executeCommand(this.store, "manualTags", [])) {
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
    return executeCommand(this.store, "replaceTags", [postId, tags, run]);
  }
}
