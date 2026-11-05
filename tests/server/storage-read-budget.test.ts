import assert from "node:assert/strict";
import test from "node:test";
import { LocalSqlDatabase } from "../../server/storage/local-store.ts";
import { Store } from "../../server/store.mjs";
import { createAPI, configuration } from "../../server/api.mjs";
import type { SqlDatabase } from "../../server/storage/sql.ts";

function fixture() {
  const sql = new LocalSqlDatabase(":memory:");
  let queries = 0;
  const db: SqlDatabase = {
    exec: (text) => sql.exec(text),
    prepare(text) {
      const statement = sql.prepare(text);
      return {
        get(...args) {
          queries++;
          return statement.get(...args);
        },
        all(...args) {
          queries++;
          return statement.all(...args);
        },
        run(...args) {
          queries++;
          return statement.run(...args);
        },
      };
    },
    transaction: (fn) => sql.transaction(fn),
    close: () => sql.close(),
  };
  const store = new Store("fixture", db);
  return {
    store,
    reset: () => {
      queries = 0;
    },
    count: () => queries,
  };
}

for (const size of [0, 10, 100, 1000]) {
  test(`post list uses at most three SQL statements for ${size} posts`, () => {
    const { store, reset, count } = fixture();
    try {
      for (let i = 0; i < size; i++)
        store.save("posts", `post-${i}`, {
          kind: "tweet",
          body: "fictional",
          tags: ["fixture"],
        });
      reset();
      const posts = store.list("posts");
      assert.equal(posts.length, size);
      assert.ok(count() <= 3, `${count()} queries for ${size} posts`);
      assert.ok(posts.every((post) => post.tags[0] === "fixture"));
    } finally {
      store.close();
    }
  });
}

test("post detail and media authorization never load the post collection", async () => {
  const { store } = fixture();
  const origin = "http://localhost:3000";
  try {
    store.save("posts", "fixture", { kind: "tweet", body: "public", tags: [] });
    store.list = () => {
      throw new Error("Unexpected collection scan");
    };
    const api = createAPI(
      store,
      configuration({ NODE_ENV: "test", KAMELOG_ORIGIN: origin }),
    );
    assert.equal(
      (await api(new Request(`${origin}/api/posts/fixture`))).status,
      200,
    );
    assert.equal(
      (await api(new Request(`${origin}/api/posts/missing`))).status,
      404,
    );
    assert.equal(
      (
        await api(
          new Request(
            `${origin}/api/media/00000000-0000-0000-0000-000000000000`,
          ),
        )
      ).status,
      404,
    );
  } finally {
    store.close();
  }
});

test("liveness does not call storage even with an expired session cookie", async () => {
  const store = new Proxy(
    {},
    {
      get() {
        throw new Error("Storage unavailable");
      },
    },
  );
  const api = createAPI(
    store,
    configuration({
      NODE_ENV: "test",
      KAMELOG_ORIGIN: "http://localhost:3000",
    }),
  );
  const response = await api(
    new Request("http://localhost:3000/api/health", {
      headers: { cookie: "kamelog-session=expired" },
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

test("media references revoke on edit/delete, exclude drafts, and roll back with posts", () => {
  const { store } = fixture();
  const id = "11111111-1111-4111-8111-111111111111";
  const url = `/api/media/${id}`;
  try {
    store.save("drafts", "draft", { kind: "tweet", images: [url] });
    assert.equal(store.publicMediaReference(id), false);
    const post = store.save("posts", "post", { kind: "tweet", images: [url] });
    assert.equal(store.publicMediaReference(id), true);
    assert.throws(() =>
      store.save(
        "posts",
        "post",
        { kind: "tweet", images: [] },
        post.revision,
        () => {
          throw new Error("rollback");
        },
      ),
    );
    assert.equal(store.publicMediaReference(id), true);
    const edited = store.save(
      "posts",
      "post",
      { kind: "tweet", images: [] },
      post.revision,
    );
    assert.equal(store.publicMediaReference(id), false);
    store.save("posts", "blog", { kind: "blog", body: `![fixture](${url})` });
    assert.equal(store.publicMediaReference(id), true);
    store.remove("posts", "blog", 1);
    assert.equal(store.publicMediaReference(id), false);
    store.save("posts", "post", { kind: "vlog", video: url }, edited.revision);
    assert.equal(store.publicMediaReference(id), true);
    store.remove("posts", "post", edited.revision + 1);
    assert.equal(store.publicMediaReference(id), false);
    const plan = store.db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT 1 FROM post_media_refs WHERE media_id=? LIMIT 1",
      )
      .all(id);
    assert.ok(
      plan.some((row) => String(row.detail).includes("post_media_refs_media")),
    );
    assert.ok(!plan.some((row) => /SCAN/.test(String(row.detail))));
  } finally {
    store.close();
  }
});

test("schema 12 media references upgrade atomically once and cloud reopen avoids backfills", () => {
  const { store, reset, count } = fixture();
  const id = "11111111-1111-4111-8111-111111111111";
  try {
    store.save("posts", "historical", {
      kind: "tweet",
      images: [`/api/media/${id}`],
    });
    store.db
      .exec(`DROP TABLE post_media_refs; DROP INDEX federation_deliveries_processing;
      DROP INDEX posts_blogs; DROP INDEX posts_federation_order; DELETE FROM migrations WHERE version=13;`);
    const migrated = new Store("cloudflare", store.db, { initialize: false });
    assert.equal(migrated.schemaVersion(), 13);
    assert.equal(migrated.publicMediaReference(id), true);
    reset();
    new Store("cloudflare", store.db, { initialize: false });
    assert.equal(count(), 1);
  } finally {
    store.close();
  }
});

test("bounded local federation page keeps update order and cursor ties", () => {
  const { store } = fixture();
  try {
    for (let i = 0; i < 100; i++)
      store.save("posts", `post-${String(i).padStart(3, "0")}`, {
        kind: "tweet",
        body: "fixture",
        date: "2026-01-01T00:00:00.000Z",
        federationEnabled: true,
      });
    store.save("posts", "updated", {
      kind: "tweet",
      body: "fixture",
      date: "2025-01-01T00:00:00.000Z",
      federationUpdatedAt: "2026-02-01T00:00:00.000Z",
      federationEnabled: true,
    });
    const first = store.federationLocalPosts(null, 10);
    assert.equal(first.length, 10);
    assert.equal(first[0].id, "updated");
    const last = first.at(-1)!;
    const next = store.federationLocalPosts([last.date, `self:${last.id}`], 10);
    assert.equal(next.length, 10);
    assert.ok(
      !next.some((post) => first.some((previous) => previous.id === post.id)),
    );
    assert.equal(
      store.federationLocalPosts([last.date, "remote:fixture"], 10).length,
      0,
    );
  } finally {
    store.close();
  }
});
