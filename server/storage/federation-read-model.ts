import { z } from "zod";
import type { SqlDatabase } from "./sql.ts";

const dateSql =
  "COALESCE(json_extract(data, '$.federationUpdatedAt'), json_extract(data, '$.updatedAt'), json_extract(data, '$.date'))";
export function federationLocalRows(
  db: SqlDatabase,
  input: unknown,
  requestedLimit: unknown,
) {
  const cursor = z.tuple([z.string(), z.string()]).nullable().parse(input);
  const limit = z.number().int().min(1).max(51).parse(requestedLimit);
  return db
    .prepare(
      `SELECT posts.*, 0 AS views, 0 AS federation_likes FROM posts
    WHERE json_extract(data, '$.federationEnabled')=1 AND json_extract(data, '$.kind')!='vlog'
      ${cursor ? `AND (${dateSql}, id) < (?, ?)` : ""}
    ORDER BY ${dateSql} DESC, id DESC LIMIT ?`,
    )
    .all(
      ...(cursor
        ? [cursor[0], cursor[1].startsWith("self:") ? cursor[1].slice(5) : ""]
        : []),
      limit,
    );
}
