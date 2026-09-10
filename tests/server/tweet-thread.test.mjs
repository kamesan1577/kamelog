import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import { createAPI, configuration } from "../../server/api.mjs";

test("tweets can form persistent parent/child threads", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-thread-"));
  const store = new Store(root);
  const origin = "http://localhost:3000";
  const api = createAPI(store, configuration({ KAMELOG_ORIGIN: origin }));
  const session = store.createSession();
  const request = (path, method = "GET", body) =>
    api(
      new Request(origin + "/api/" + path, {
        method,
        headers: {
          origin,
          cookie: "kamelog-session=" + session,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  try {
    const rootTweet = await (
      await request("posts", "POST", {
        kind: "tweet",
        title: "",
        body: "root",
      })
    ).json();

    const childResponse = await request("posts", "POST", {
      kind: "tweet",
      title: "",
      body: "child",
      parentId: rootTweet.id,
    });
    assert.equal(childResponse.status, 201);
    const child = await childResponse.json();
    assert.equal(child.parentId, rootTweet.id);

    const grandchildResponse = await request("posts", "POST", {
      kind: "tweet",
      title: "",
      body: "grandchild",
      parentId: child.id,
    });
    assert.equal(grandchildResponse.status, 201);
    const grandchild = await grandchildResponse.json();
    assert.equal(grandchild.parentId, child.id);

    const missingParent = await request("posts", "POST", {
      kind: "tweet",
      title: "",
      body: "orphan",
      parentId: "missing-parent",
    });
    assert.equal(missingParent.status, 400);

    const blog = await (
      await request("posts", "POST", {
        kind: "blog",
        title: "fixture blog",
        body: "body",
      })
    ).json();
    const blogParent = await request("posts", "POST", {
      kind: "tweet",
      title: "",
      body: "invalid parent kind",
      parentId: blog.id,
    });
    assert.equal(blogParent.status, 400);

    const nonTweetChild = await request("posts", "POST", {
      kind: "blog",
      title: "invalid child",
      body: "body",
      parentId: rootTweet.id,
    });
    assert.equal(nonTweetChild.status, 400);

    const updatedResponse = await request("posts/" + child.id, "PUT", {
      kind: "tweet",
      title: "",
      body: "child edited by the normal composer",
      revision: child.revision,
    });
    assert.equal(updatedResponse.status, 200);
    const updated = await updatedResponse.json();
    assert.equal(updated.parentId, rootTweet.id);

    const changedParent = await request("posts/" + child.id, "PUT", {
      kind: "tweet",
      title: "",
      body: "try to move child",
      revision: updated.revision,
      parentId: grandchild.id,
    });
    assert.equal(changedParent.status, 400);

    const posts = await (await request("posts")).json();
    assert.equal(
      posts.find((post) => post.id === child.id).parentId,
      rootTweet.id,
    );
    assert.equal(
      posts.find((post) => post.id === grandchild.id).parentId,
      child.id,
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
