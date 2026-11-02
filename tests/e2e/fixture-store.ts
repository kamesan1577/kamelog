import { access, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/storage/local-store.ts";

export async function findE2EDataDirectory() {
  const candidates = await Promise.all(
    (await readdir(tmpdir(), { withFileTypes: true }))
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith("kamelog-e2e-"),
      )
      .map(async (entry) => {
        const path = join(tmpdir(), entry.name);
        return { path, modified: (await stat(path)).mtimeMs };
      }),
  );
  for (const candidate of candidates.sort((a, b) => b.modified - a.modified)) {
    try {
      await access(join(candidate.path, "kamelog.sqlite"));
      return candidate.path;
    } catch {
      // Ignore interrupted runs whose temporary database was already removed.
    }
  }
  throw new Error("active kamelog E2E data directory not found");
}

export function removePostFixtures(
  directory: string | undefined,
  ids: readonly string[],
) {
  if (!directory) return;
  const store = new Store(directory);
  try {
    for (const id of ids) {
      const post = store.get("posts", id);
      if (post) store.remove("posts", id, post.revision);
    }
  } finally {
    store.close();
  }
}
