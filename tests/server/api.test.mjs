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
    assert.equal(post.views, 0);
    assert.deepEqual(post.tags, []);
    assert.equal(
      (
        await request("posts/" + post.id + "/view", "POST", {}, false, {
          origin: "https://evil.example",
        })
      ).status,
      403,
    );
    const viewed = await (
      await request("posts/" + post.id + "/view", "POST", {})
    ).json();
    assert.equal(viewed.views, 1);
    assert.equal((await (await request("posts/" + post.id)).json()).views, 1);
    assert.equal((await request("posts/missing/view", "POST", {})).status, 404);
    const tagged = await (
      await request(
        "posts",
        "POST",
        {
          kind: "tweet",
          title: "#タイトル",
          body: "本文 #Go と #開発日記、重複 #Go",
          tags: ["無視される固定タグ"],
        },
        true,
      )
    ).json();
    assert.deepEqual(tagged.tags, ["タイトル", "Go", "開発日記"]);
    assert.equal((await (await request("posts?q=開発日記")).json()).length, 1);
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

test("uploaded images stay private until referenced and tweets accept at most four", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-image-api-"));
  const store = new Store(root);
  const origin = "http://localhost:3000";
  const api = createAPI(store, configuration({ KAMELOG_ORIGIN: origin }));
  const session = store.createSession();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = (owner = true, bytes = png, type = "image/png") =>
    api(
      new Request(origin + "/api/media?kind=image", {
        method: "POST",
        headers: {
          origin,
          "content-type": type,
          ...(owner ? { cookie: "kamelog-session=" + session } : {}),
        },
        body: bytes,
      }),
    );
  try {
    assert.equal((await upload(false)).status, 401);
    assert.equal((await upload(true, Buffer.from("fake"))).status, 400);
    const uploaded = await (await upload()).json();
    assert.equal((await api(new Request(origin + uploaded.url))).status, 404);
    const postResponse = await api(
      new Request(origin + "/api/posts", {
        method: "POST",
        headers: {
          origin,
          cookie: "kamelog-session=" + session,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "tweet",
          title: "",
          body: "",
          images: [uploaded.url],
        }),
      }),
    );
    assert.equal(postResponse.status, 201);
    assert.equal((await api(new Request(origin + uploaded.url))).status, 200);
    const tooMany = await api(
      new Request(origin + "/api/posts", {
        method: "POST",
        headers: {
          origin,
          cookie: "kamelog-session=" + session,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          kind: "tweet",
          title: "",
          body: "five",
          images: Array(5).fill(uploaded.url),
        }),
      }),
    );
    assert.equal(tooMany.status, 400);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
