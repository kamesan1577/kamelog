import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import { createAPI, configuration } from "../../server/api.mjs";
import { localPostObject } from "../../server/federation-outbound.mjs";
import { createFederationIdentity } from "../../server/activitypub.mjs";
import { createActivityPubHandler } from "../../server/activitypub.mjs";

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

test("drafts retain parentId and federated replies expose inReplyTo", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-thread-federation-"));
  const store = new Store(root);
  const origin = "http://localhost:3000";
  const config = configuration({ KAMELOG_ORIGIN: origin });
  const api = createAPI(store, config);
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
    const parent = await (
      await request("posts", "POST", {
        kind: "tweet",
        title: "",
        body: "parent",
      })
    ).json();
    const draftResponse = await request("drafts", "POST", {
      kind: "tweet",
      title: "",
      body: "reply draft",
      parentId: parent.id,
    });
    assert.equal(draftResponse.status, 201);
    const draft = await draftResponse.json();
    assert.equal(draft.parentId, parent.id);
    assert.equal(
      (await (await request("drafts")).json())[0].parentId,
      parent.id,
    );
    const updatedDraftResponse = await request(`drafts/${draft.id}`, "PUT", {
      kind: "tweet",
      title: "",
      body: "edited reply draft",
      revision: draft.revision,
    });
    assert.equal(updatedDraftResponse.status, 200);
    assert.equal((await updatedDraftResponse.json()).parentId, parent.id);

    createFederationIdentity(store, "owner");
    const enabledParent = await (
      await request("posts", "POST", {
        kind: "tweet",
        title: "",
        body: "federated parent",
        federationEnabled: true,
      })
    ).json();
    const child = await (
      await request("posts", "POST", {
        kind: "tweet",
        title: "",
        body: "federated child",
        parentId: enabledParent.id,
        federationEnabled: true,
      })
    ).json();
    assert.equal(
      localPostObject(store, config, child).inReplyTo,
      `${origin}/activitypub/objects/${child.parentId}`,
    );
    const objectResponse = await createActivityPubHandler(
      store,
      config,
    )(new Request(`${origin}/activitypub/objects/${child.id}`));
    assert.equal(objectResponse.status, 200);
    assert.equal(
      (await objectResponse.json()).inReplyTo,
      `${origin}/activitypub/objects/${child.parentId}`,
    );

    const privateParent = await (
      await request("posts", "POST", {
        kind: "tweet",
        title: "",
        body: "private parent",
        federationEnabled: false,
      })
    ).json();
    const localOnlyChild = await request("posts", "POST", {
      kind: "tweet",
      title: "",
      body: "local-only reply",
      parentId: privateParent.id,
    });
    assert.equal(localOnlyChild.status, 201);
    assert.equal((await localOnlyChild.json()).parentId, privateParent.id);
    const rejected = await request("posts", "POST", {
      kind: "tweet",
      title: "",
      body: "cannot federate",
      parentId: privateParent.id,
      federationEnabled: true,
    });
    assert.equal(rejected.status, 400);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
