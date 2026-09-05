import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import { createAPI, configuration } from "../../server/api.mjs";
test("owner boundary, public projection, CRUD, CSRF, validation", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-api-"));
  const store = new Store(root),
    origin = "http://localhost:3000";
  const api = createAPI(store, configuration({ KAMELOG_ORIGIN: origin }));
  const session = store.createSession();
  const request = (path, method = "GET", body, owner = false, extra = {}) =>
    api(
      new Request(origin + "/api/" + path, {
        method,
        headers: {
          origin,
          ...(owner ? { cookie: "kamelog-session=" + session } : {}),
          "content-type": "application/json",
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  try {
    assert.equal(
      (await request("posts", "POST", { kind: "tweet", body: "secret" }))
        .status,
      401,
    );
    assert.equal(
      (
        await request(
          "posts",
          "POST",
          { kind: "tweet", body: "fixture" },
          true,
          { origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal((await request("drafts")).status, 401);
    const draft = await (
      await request(
        "drafts",
        "POST",
        { kind: "blog", title: "private fixture", body: "secret" },
        true,
      )
    ).json();
    assert.equal(draft.revision, 1);
    assert.deepEqual(await (await request("posts")).json(), []);
    assert.equal(
      (
        await request(
          "posts",
          "POST",
          { kind: "blog", title: "", body: "" },
          true,
        )
      ).status,
      400,
    );
    const post = await (
      await request(
        "posts",
        "POST",
        { kind: "tweet", body: "public fixture" },
        true,
      )
    ).json();
    assert.equal(post.revision, 1);
    assert.equal(
      (
        await request(
          "posts/" + post.id,
          "PUT",
          { kind: "tweet", body: "wrong revision", revision: 99 },
          true,
        )
      ).status,
      409,
    );
    const updated = await (
      await request(
        "posts/" + post.id,
        "PUT",
        { kind: "tweet", body: "updated", revision: 1 },
        true,
      )
    ).json();
    assert.equal(updated.body, "updated");
    assert.equal(
      (
        await request("posts/" + post.id, "DELETE", undefined, true, {
          "if-match": "2",
        })
      ).status,
      200,
    );
    assert.equal((await request("media/../../etc/passwd")).status, 401);
    assert.equal((await request("auth/logout", "POST", {}, true)).status, 200);
    assert.equal((await request("drafts", "GET", undefined, true)).status, 401);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("bootstrap token and invalid registration response never authenticate", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-ceremony-")),
    store = new Store(root),
    origin = "https://example.test";
  const api = createAPI(
    store,
    configuration({
      KAMELOG_ORIGIN: origin,
      KAMELOG_BOOTSTRAP_TOKEN: "fictional-test-token-32-characters-long",
    }),
  );
  const call = (path, body, cookie = "") =>
    api(
      new Request(origin + "/api/auth/" + path, {
        method: "POST",
        headers: { origin, cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  try {
    assert.equal(
      (await call("register/options", { token: "wrong" })).status,
      401,
    );
    const options = await call("register/options", {
      token: "fictional-test-token-32-characters-long",
    });
    assert.equal(options.status, 200);
    assert.match(options.headers.get("set-cookie"), /Secure/);
    const cookie = options.headers.get("set-cookie").split(";")[0];
    assert.notEqual(
      (await call("register/verify", { id: "invalid" }, cookie)).status,
      200,
    );
    assert.equal(
      (await call("register/verify", { id: "invalid" }, cookie)).status,
      401,
    );
    assert.equal(store.credentials().length, 0);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
