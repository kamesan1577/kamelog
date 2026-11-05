import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { LocalBlobStorage } from "../../server/storage/blobs.ts";
import { Store } from "../../server/storage/local-store.ts";
import {
  migrateStorage,
  GatewayMigrationTarget,
} from "../../server/storage/migration.ts";

export async function verifyStorageReadBudget(
  directory: string,
  request: typeof fetch,
) {
  const results = [];
  for (const count of [0, 10, 100, 1000]) {
    const source = join(directory, `budget-${count}`);
    const store = new Store(source);
    const mediaId = "11111111-1111-4111-8111-111111111111";
    try {
      const bytes = Buffer.from("fictional image fixture");
      store.save("media", mediaId, {
        kind: "image",
        type: "image/png",
        extension: "png",
        size: bytes.length,
      });
      await new LocalBlobStorage(source).put(`media/${mediaId}.png`, bytes);
      store.save("drafts", "private-media", {
        kind: "tweet",
        images: [`/api/media/${mediaId}`],
      });
      store.enqueueFederationActivity(
        {
          id: "fixture-history",
          type: "Create",
          objectId: "fixture",
          body: {},
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        [],
      );
      const history = store.db.prepare(
        "INSERT INTO federation_deliveries(activity_id,inbox_url,state,next_attempt_at) VALUES('fixture-history',?,'succeeded',0)",
      );
      for (let i = 0; i < count; i++)
        history.run(`https://remote.example/inbox/${i}`);
      for (let i = 0; i < count; i++)
        store.save("posts", `post-${i}`, {
          kind: "tweet",
          body: "fictional read budget",
          date: "2026-01-01T00:00:00.000Z",
          tags: ["fixture"],
          ...(i === 0 ? { images: [`/api/media/${mediaId}`] } : {}),
        });
    } finally {
      store.close();
    }
    const generation = randomUUID();
    const options = {
      endpoint: "https://fictional-storage.example",
      token: "fictional-storage-test-token-00000000000000",
      generation,
      fetch: request,
    };
    await migrateStorage({
      source,
      backupDirectory: join(directory, `budget-backup-${count}`),
      generation,
      target: () => new GatewayMigrationTarget(options),
    });
    const measured = async (method: string, args: unknown[]) => {
      const response = await request(`${options.endpoint}/rpc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
          "X-Storage-Generation": generation,
        },
        body: JSON.stringify({
          requestId: randomUUID(),
          issuedAt: Date.now(),
          method,
          args,
        }),
      });
      assert.equal(response.status, 200);
      const sql = Number(response.headers.get("X-Storage-Sql-Count"));
      const read = Number(response.headers.get("X-Storage-Rows-Read"));
      assert.ok(response.headers.has("X-Storage-Rows-Read"));
      await response.arrayBuffer();
      return { sql, read };
    };
    await measured("schemaVersion", []); // Exclude constructor/wakeup from steady-state budgets.
    const list = await measured("list", ["posts"]);
    const detail = await measured("get", ["posts", "post-0"]);
    const media = await measured("publicMediaReference", [mediaId]);
    const idle = await measured("$command", ["pollFederation", [Date.now()]]);
    assert.ok(list.sql <= 5, JSON.stringify({ count, list }));
    assert.ok(list.read <= 10 * count + 20, JSON.stringify({ count, list }));
    assert.ok(detail.read <= 20, JSON.stringify({ count, detail }));
    assert.ok(media.read <= 5, JSON.stringify({ count, media }));
    assert.ok(idle.read <= 30, JSON.stringify({ count, idle }));
    results.push({ posts: count, list, detail, media, idle });
  }
  console.log(`workerd: measured rowsRead budgets ${JSON.stringify(results)}`);
}
