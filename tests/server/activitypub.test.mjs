import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createActivityPubHandler,
  createFederationIdentity,
  federationStatus,
  sanitizeRemoteHtml,
  signFederationRequest,
  validateFederationUsername,
  verifyFederationRequest,
} from "../../server/activitypub.mjs";
import { createAPI, configuration } from "../../server/api.mjs";
import {
  fetchFederationJson,
  normalizeFederationUrl,
  postFederationActivity,
} from "../../server/federation-fetch.mjs";
import {
  enqueuePostFederationTransition,
  localPostObject,
} from "../../server/federation-outbound.mjs";
import { processNextFederationDelivery } from "../../server/federation-worker.mjs";
import { federationRemoteImage } from "../../server/federation-media.mjs";
import {
  followRemoteActor,
  processIncomingRemoteActivity,
  unfollowRemoteActor,
} from "../../server/federation-remote.mjs";
import { ownerFederationTimeline } from "../../server/federation-timeline.mjs";
import { Store } from "../../server/store.mjs";

const origin = "https://example.test";
const config = configuration({ KAMELOG_ORIGIN: origin });

async function withStore(prefix, run) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const store = new Store(root);
  try {
    await run(store, root);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("federation username validation is stable and rejects reserved identities", () => {
  assert.equal(validateFederationUsername(" Kamesan_1577 "), "kamesan_1577");
  for (const value of [
    "",
    "@owner",
    "日本語",
    "has-hyphen",
    "admin",
    "a".repeat(65),
  ])
    assert.throws(() => validateFederationUsername(value), TypeError);
});

test("owner setup persists one key pair and never returns the private key", async () => {
  await withStore("kamelog-federation-setup-", async (store, root) => {
    const session = store.createSession();
    const api = createAPI(store, config);
    const call = (path, method = "GET", body, requestOrigin = origin) =>
      api(
        new Request(`${origin}/api/${path}`, {
          method,
          headers: {
            origin: requestOrigin,
            cookie: `__Host-kamelog-session=${session}`,
            "content-type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );

    assert.equal((await call("federation/status")).status, 200);
    assert.deepEqual(await (await call("federation/status")).json(), {
      enabled: false,
      host: "example.test",
    });
    assert.equal(
      (
        await call(
          "federation/setup",
          "POST",
          { username: "owner" },
          "https://evil.test",
        )
      ).status,
      403,
    );
    const setup = await call("federation/setup", "POST", {
      username: "kamesan",
    });
    assert.equal(setup.status, 201);
    const publicStatus = await setup.json();
    assert.equal(publicStatus.handle, "@kamesan@example.test");
    assert.equal(JSON.stringify(publicStatus).includes("PRIVATE KEY"), false);
    const privateKey = store.federationIdentity().privateKeyPem;
    assert.match(privateKey, /BEGIN PRIVATE KEY/);
    assert.equal(
      (await call("federation/setup", "POST", { username: "other" })).status,
      409,
    );

    const reopened = new Store(root);
    try {
      assert.equal(reopened.federationIdentity().privateKeyPem, privateKey);
      assert.equal(
        federationStatus(reopened, config).handle,
        "@kamesan@example.test",
      );
    } finally {
      reopened.close();
    }
  });
});

test("WebFinger and actor endpoints stay dark until setup", async () => {
  await withStore("kamelog-federation-endpoints-", async (store) => {
    const handler = createActivityPubHandler(store, config);
    const webfinger = () =>
      handler(
        new Request(
          `${origin}/.well-known/webfinger?resource=acct:kamesan@example.test`,
        ),
      );
    assert.equal((await webfinger()).status, 404);
    createFederationIdentity(store, "kamesan");
    assert.equal(
      (
        await handler(
          new Request(
            `${origin}/.well-known/webfinger?resource=acct:other@example.test`,
          ),
        )
      ).status,
      404,
    );
    const finger = await webfinger();
    assert.equal(finger.status, 200);
    assert.equal(finger.headers.get("content-type"), "application/jrd+json");
    assert.equal(
      (await finger.json()).links[0].href,
      `${origin}/activitypub/actor`,
    );
    const actorResponse = await handler(
      new Request(`${origin}/activitypub/actor`),
    );
    const actor = await actorResponse.json();
    assert.equal(actor.type, "Person");
    assert.equal(actor.preferredUsername, "kamesan");
    assert.equal(actor.publicKey.owner, actor.id);
    assert.equal(actor.publicKey.publicKeyPem.includes("PRIVATE"), false);
    for (const name of ["outbox", "followers", "following"]) {
      const response = await handler(
        new Request(`${origin}/activitypub/${name}`),
      );
      assert.deepEqual((await response.json()).orderedItems, []);
    }
    assert.equal(
      (
        await handler(
          new Request(`${origin}/activitypub/inbox`, {
            method: "POST",
            headers: { "content-type": "text/plain" },
            body: "not activity json",
          }),
        )
      ).status,
      415,
    );
    assert.equal(
      (
        await handler(
          new Request(`${origin}/activitypub/inbox`, {
            method: "POST",
            headers: { "content-type": "application/activity+json" },
            body: "x".repeat(1024 * 1024 + 1),
          }),
        )
      ).status,
      413,
    );
  });
});

test("HTTP signatures validate the raw body and reject tampering", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const actorUrl = "https://remote.example/users/alice";
  const body = Buffer.from(
    JSON.stringify({
      id: "https://remote.example/activities/1",
      type: "Create",
      actor: actorUrl,
    }),
  );
  const headers = signFederationRequest(
    `${origin}/activitypub/inbox`,
    "POST",
    body,
    { actorUrl, privateKeyPem: privateKey },
    new Date("2026-09-16T12:00:00Z"),
  );
  const request = new Request(`${origin}/activitypub/inbox`, {
    method: "POST",
    headers,
    body,
  });
  const fetchJson = async () => ({
    value: {
      id: actorUrl,
      publicKey: {
        id: `${actorUrl}#main-key`,
        owner: actorUrl,
        publicKeyPem: publicKey,
      },
    },
    url: new URL(actorUrl),
  });
  assert.equal(
    (
      await verifyFederationRequest(request, body, {
        now: new Date("2026-09-16T12:01:00Z"),
        fetchJson,
      })
    ).id,
    actorUrl,
  );
  await assert.rejects(() =>
    verifyFederationRequest(request, Buffer.from("tampered"), {
      now: new Date("2026-09-16T12:01:00Z"),
      fetchJson,
    }),
  );
});

test("signed inbox input is idempotent", async () => {
  await withStore("kamelog-federation-inbox-", async (store) => {
    createFederationIdentity(store, "kamesan");
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const actorUrl = "https://remote.example/users/alice";
    const activity = {
      id: "https://remote.example/activities/repeated",
      type: "Create",
      actor: actorUrl,
    };
    const bytes = Buffer.from(JSON.stringify(activity));
    const fetchJson = async () => ({
      value: {
        id: actorUrl,
        type: "Person",
        preferredUsername: "alice",
        inbox: `${actorUrl}/inbox`,
        publicKey: {
          id: `${actorUrl}#main-key`,
          owner: actorUrl,
          publicKeyPem: publicKey,
        },
      },
    });
    const handler = createActivityPubHandler(store, config, {
      now: new Date("2026-09-16T12:00:00Z"),
      fetchJson,
    });
    const deliver = () => {
      const headers = signFederationRequest(
        `${origin}/activitypub/inbox`,
        "POST",
        bytes,
        { actorUrl, privateKeyPem: privateKey },
        new Date("2026-09-16T12:00:00Z"),
      );
      return handler(
        new Request(`${origin}/activitypub/inbox`, {
          method: "POST",
          headers,
          body: bytes,
        }),
      );
    };
    assert.equal((await deliver()).status, 202);
    assert.equal((await deliver()).status, 202);
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM federation_inbox_activities")
        .get().count,
      1,
    );
  });
});

test("remote HTML is allowlisted and strips executable content", () => {
  const sanitized = sanitizeRemoteHtml(
    '<p onclick="steal()">hello <strong>world</strong><script>alert(1)</script><a href="javascript:alert(2)" onmouseover="x()">bad</a><a href="https://example.org/post">ok</a></p>',
  );
  assert.equal(sanitized.includes("script"), false);
  assert.equal(sanitized.includes("onclick"), false);
  assert.equal(sanitized.includes("javascript:"), false);
  assert.match(sanitized, /rel="nofollow noopener noreferrer"/);
  assert.match(sanitized, /target="_blank"/);
});

test("federation fetch blocks private targets and revalidates redirects", async () => {
  assert.throws(() => normalizeFederationUrl("http://example.org/actor"));
  assert.throws(() => normalizeFederationUrl("https://127.0.0.1/actor"));
  assert.throws(() =>
    normalizeFederationUrl("https://169.254.169.254/latest/meta-data"),
  );
  await assert.rejects(() =>
    fetchFederationJson("https://public.example/actor", {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async () => ({ redirect: "https://127.0.0.1/internal" }),
    }),
  );
  await assert.rejects(() =>
    postFederationActivity("https://public.example/inbox", "{}", () => ({}), {
      lookup: async () => [{ address: "8.8.8.8", family: 4 }],
      request: async () => ({
        status: 307,
        redirect: "https://169.254.169.254/latest/meta-data",
      }),
    }),
  );
});

test("local tweets and blogs serialize as public Notes", async () => {
  await withStore("kamelog-federation-notes-", async (store) => {
    store.save("media", "11111111-1111-4111-8111-111111111111", {
      kind: "image",
      type: "image/png",
      extension: "png",
    });
    const tweet = {
      id: "tweet-1",
      revision: 1,
      kind: "tweet",
      title: "",
      body: "<hello>\nworld",
      date: "2026-09-16T00:00:00.000Z",
      images: ["/api/media/11111111-1111-4111-8111-111111111111"],
      federationEnabled: true,
    };
    const note = localPostObject(store, config, tweet);
    assert.equal(note.type, "Note");
    assert.equal(note.content, "<p>&lt;hello&gt;<br>world</p>");
    assert.equal(note.url, `${origin}/?post=tweet-1`);
    assert.equal(note.attachment[0].mediaType, "image/png");
    assert.equal(
      note.attachment[0].url,
      `${origin}/api/media/11111111-1111-4111-8111-111111111111`,
    );

    const blog = localPostObject(store, config, {
      ...tweet,
      id: "blog-1",
      kind: "blog",
      title: "SQLite <運用>",
      body: "本文 ".repeat(200),
      images: [],
    });
    assert.match(blog.content, /SQLite &lt;運用&gt;/);
    assert.match(blog.content, /続きを読む/);
    assert.ok(blog.content.length < 800);
    assert.equal(blog.url, `${origin}/?post=blog-1`);
  });
});

test("post federation state enqueues Create, Update and Delete atomically", async () => {
  await withStore("kamelog-federation-posts-", async (store) => {
    createFederationIdentity(store, "kamesan");
    store.saveFederationFollower({
      actorId: "https://remote.example/users/alice",
      inboxUrl: "https://remote.example/users/alice/inbox",
      sharedInboxUrl: "https://remote.example/inbox",
      followActivityId: "https://remote.example/follows/1",
      followedAt: "2026-09-16T00:00:00.000Z",
    });
    const session = store.createSession();
    const api = createAPI(store, config);
    const call = (path, method, value, revision) =>
      api(
        new Request(`${origin}/api/${path}`, {
          method,
          headers: {
            origin,
            cookie: `__Host-kamelog-session=${session}`,
            "content-type": "application/json",
            ...(revision === undefined ? {} : { "if-match": String(revision) }),
          },
          body: value === undefined ? undefined : JSON.stringify(value),
        }),
      );
    const created = await (
      await call("posts", "POST", {
        kind: "tweet",
        body: "federated",
        federationEnabled: true,
      })
    ).json();
    assert.equal(created.federationEnabled, true);
    assert.deepEqual(
      store.federationOutboxActivities().map(({ type }) => type),
      ["Create"],
    );
    assert.equal(store.federationDiagnostics().pendingDeliveries, 1);
    const publicHandler = createActivityPubHandler(store, config);
    const objectResponse = await publicHandler(
      new Request(`${origin}/activitypub/objects/${created.id}`),
    );
    assert.equal(objectResponse.status, 200);
    assert.equal((await objectResponse.json()).type, "Note");
    const outboxResponse = await publicHandler(
      new Request(`${origin}/activitypub/outbox`),
    );
    assert.equal((await outboxResponse.json()).totalItems, 1);

    const pinned = await (
      await call(`posts/${created.id}`, "PUT", {
        kind: "tweet",
        body: created.body,
        pinned: true,
        revision: created.revision,
        federationEnabled: true,
      })
    ).json();
    assert.equal(store.federationOutboxActivities().length, 1);
    const updated = await (
      await call(`posts/${created.id}`, "PUT", {
        kind: "tweet",
        body: "updated",
        revision: pinned.revision,
        federationEnabled: true,
      })
    ).json();
    const disabled = await (
      await call(`posts/${created.id}`, "PUT", {
        kind: "tweet",
        body: updated.body,
        revision: updated.revision,
        federationEnabled: false,
      })
    ).json();
    assert.deepEqual(
      store.federationOutboxActivities().map(({ type }) => type),
      ["Delete", "Update", "Create"],
    );
    const enabled = await (
      await call(`posts/${created.id}`, "PUT", {
        kind: "tweet",
        body: disabled.body,
        revision: disabled.revision,
        federationEnabled: true,
      })
    ).json();
    assert.equal(
      (await call(`posts/${created.id}`, "DELETE", undefined, enabled.revision))
        .status,
      200,
    );
    assert.deepEqual(
      store.federationOutboxActivities().map(({ type }) => type),
      ["Delete", "Create", "Delete", "Update", "Create"],
    );
  });
});

test("signed Follow is accepted once and Undo removes the follower", async () => {
  await withStore("kamelog-federation-follow-", async (store) => {
    createFederationIdentity(store, "kamesan");
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const actorUrl = "https://remote.example/users/alice";
    const remoteActor = {
      id: actorUrl,
      type: "Person",
      preferredUsername: "alice",
      inbox: `${actorUrl}/inbox`,
      endpoints: { sharedInbox: "https://remote.example/inbox" },
      publicKey: {
        id: `${actorUrl}#main-key`,
        owner: actorUrl,
        publicKeyPem: publicKey,
      },
    };
    const handler = createActivityPubHandler(store, config, {
      now: new Date("2026-09-16T12:00:00Z"),
      fetchJson: async () => ({ value: remoteActor }),
    });
    const follow = {
      id: "https://remote.example/activities/follow-1",
      type: "Follow",
      actor: actorUrl,
      object: `${origin}/activitypub/actor`,
    };
    const deliver = (activity) => {
      const bytes = Buffer.from(JSON.stringify(activity));
      return handler(
        new Request(`${origin}/activitypub/inbox`, {
          method: "POST",
          headers: signFederationRequest(
            `${origin}/activitypub/inbox`,
            "POST",
            bytes,
            { actorUrl, privateKeyPem: privateKey },
            new Date("2026-09-16T12:00:00Z"),
          ),
          body: bytes,
        }),
      );
    };
    assert.equal((await deliver(follow)).status, 202);
    assert.equal((await deliver(follow)).status, 202);
    assert.equal(store.federationFollowers().length, 1);
    assert.equal(
      store.federationFollowers()[0].sharedInboxUrl,
      remoteActor.endpoints.sharedInbox,
    );
    assert.equal(store.federationOutboxActivities()[0].type, "Accept");
    assert.equal(store.federationDiagnostics().pendingDeliveries, 1);

    assert.equal(
      (
        await deliver({
          id: "https://remote.example/activities/undo-1",
          type: "Undo",
          actor: actorUrl,
          object: follow,
        })
      ).status,
      202,
    );
    assert.equal(store.federationFollowers().length, 0);
  });
});

test("remote handles enqueue Follow and Undo through the durable outbox", async () => {
  await withStore("kamelog-federation-following-", async (store) => {
    createFederationIdentity(store, "kamesan");
    const actorUrl = "https://remote.example/users/alice";
    const fetchJson = async (url) => {
      const value = String(url);
      if (value.includes("/.well-known/webfinger"))
        return {
          value: {
            subject: "acct:alice@remote.example",
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: actorUrl,
              },
            ],
          },
        };
      assert.equal(value, actorUrl);
      return {
        value: {
          id: actorUrl,
          type: "Person",
          preferredUsername: "alice",
          name: "Alice",
          inbox: `${actorUrl}/inbox`,
          endpoints: { sharedInbox: "https://remote.example/inbox" },
        },
      };
    };
    const following = await followRemoteActor(
      store,
      config,
      "@alice@remote.example",
      { fetchJson, now: new Date("2026-09-16T12:00:00Z") },
    );
    assert.equal(following.handle, "@alice@remote.example");
    assert.equal(following.state, "pending");
    assert.equal(store.federationOutboxActivities()[0].type, "Follow");
    assert.equal(store.federationDiagnostics().pendingDeliveries, 1);

    assert.deepEqual(
      unfollowRemoteActor(
        store,
        config,
        actorUrl,
        new Date("2026-09-16T12:01:00Z"),
      ),
      { ok: true },
    );
    assert.equal(store.federationFollowing(actorUrl), null);
    const undo = store.federationOutboxActivities()[0];
    assert.equal(undo.type, "Undo");
    assert.equal(undo.object.type, "Follow");
  });
});

test("accepted remote activities maintain a sanitized, idempotent timeline", async () => {
  await withStore("kamelog-federation-timeline-", async (store) => {
    createFederationIdentity(store, "kamesan");
    const actorUrl = "https://remote.example/users/alice";
    const actor = {
      id: actorUrl,
      type: "Person",
      preferredUsername: "alice",
      name: "Alice",
      inbox: `${actorUrl}/inbox`,
    };
    const following = await followRemoteActor(
      store,
      config,
      "alice@remote.example",
      {
        now: new Date("2026-09-16T12:00:00Z"),
        fetchJson: async (url) =>
          String(url).includes("webfinger")
            ? {
                value: {
                  links: [
                    {
                      rel: "self",
                      type: "application/activity+json",
                      href: actorUrl,
                    },
                  ],
                },
              }
            : { value: actor },
      },
    );
    await processIncomingRemoteActivity(
      store,
      {
        id: `${actorUrl}/activities/accept`,
        type: "Accept",
        actor: actorUrl,
        object: following.followActivityId,
      },
      actor,
      { now: new Date("2026-09-16T12:01:00Z") },
    );
    assert.equal(store.federationFollowing(actorUrl).state, "accepted");
    const handler = createActivityPubHandler(store, config);
    assert.deepEqual(
      (
        await (
          await handler(new Request(`${origin}/activitypub/following`))
        ).json()
      ).orderedItems,
      [actorUrl],
    );

    const objectId = `${actorUrl}/notes/1`;
    const note = {
      id: objectId,
      type: "Note",
      attributedTo: actorUrl,
      to: ["https://www.w3.org/ns/activitystreams#Public"],
      content: "<p>Hello <strong>world</strong><script>bad()</script></p>",
      url: objectId,
      published: "2026-09-16T12:02:00Z",
      attachment: [
        {
          type: "Document",
          mediaType: "image/png",
          url: "https://remote.example/media/1.png",
        },
      ],
    };
    const create = {
      id: `${actorUrl}/activities/create-1`,
      type: "Create",
      actor: actorUrl,
      object: note,
    };
    assert.equal(
      await processIncomingRemoteActivity(store, create, actor, {
        now: new Date("2026-09-16T12:02:00Z"),
      }),
      true,
    );
    assert.equal(
      await processIncomingRemoteActivity(store, create, actor),
      false,
    );
    assert.equal(store.federationTimeline().length, 1);
    assert.equal(
      store.federationTimeline()[0].contentHtml.includes("script"),
      false,
    );
    assert.equal(store.federationTimeline()[0].attachments.length, 1);

    await processIncomingRemoteActivity(
      store,
      {
        id: `${actorUrl}/activities/update-1`,
        type: "Update",
        actor: actorUrl,
        object: { ...note, content: "<p>Updated</p>" },
      },
      actor,
      { now: new Date("2026-09-16T12:03:00Z") },
    );
    assert.equal(
      store.federationRemoteObject(objectId).contentHtml,
      "<p>Updated</p>",
    );

    await processIncomingRemoteActivity(
      store,
      {
        id: `${actorUrl}/activities/delete-1`,
        type: "Delete",
        actor: actorUrl,
        object: objectId,
      },
      actor,
      { now: new Date("2026-09-16T12:04:00Z") },
    );
    assert.equal(store.federationTimeline().length, 0);
    assert.equal(
      store.federationRemoteObject(objectId).deletedAt,
      "2026-09-16T12:04:00.000Z",
    );

    const boostedId = "https://elsewhere.example/notes/boosted";
    const announce = {
      id: `${actorUrl}/activities/announce-1`,
      type: "Announce",
      actor: actorUrl,
      published: "2026-09-16T12:05:00Z",
      object: {
        id: boostedId,
        type: "Note",
        attributedTo: "https://elsewhere.example/users/bob",
        to: ["https://www.w3.org/ns/activitystreams#Public"],
        content: "<p>Boosted</p>",
      },
    };
    await processIncomingRemoteActivity(store, announce, actor, {
      now: new Date("2026-09-16T12:05:00Z"),
    });
    assert.equal(store.federationTimeline()[0].activityType, "Announce");
    await processIncomingRemoteActivity(
      store,
      {
        id: `${actorUrl}/activities/undo-announce-1`,
        type: "Undo",
        actor: actorUrl,
        object: announce,
      },
      actor,
      { now: new Date("2026-09-16T12:06:00Z") },
    );
    assert.equal(store.federationTimeline().length, 0);

    await processIncomingRemoteActivity(
      store,
      {
        id: `${actorUrl}/activities/reject`,
        type: "Reject",
        actor: actorUrl,
        object: following.followActivityId,
      },
      actor,
      { now: new Date("2026-09-16T12:07:00Z") },
    );
    assert.equal(store.federationFollowing(actorUrl).state, "rejected");
  });
});

test("owner timeline combines remote and self posts with stable cursors", async () => {
  await withStore("kamelog-federation-owner-timeline-", async (store) => {
    createFederationIdentity(store, "kamesan");
    const actorId = "https://remote.example/users/alice";
    const objectId = "https://remote.example/notes/1";
    store.saveFederationRemoteActor({
      actorId,
      handle: "@alice@remote.example",
      inboxUrl: `${actorId}/inbox`,
      preferredUsername: "alice",
      displayName: "Alice",
      fetchedAt: "2026-09-16T12:00:00.000Z",
    });
    store.saveFederationFollowing({
      actorId,
      state: "accepted",
      followActivityId: `${origin}/activitypub/activities/follow/1`,
      createdAt: "2026-09-16T11:00:00.000Z",
      updatedAt: "2026-09-16T11:01:00.000Z",
    });
    store.saveFederationRemoteObject({
      objectId,
      actorId,
      type: "Note",
      contentHtml: "<p>Remote</p>",
      url: objectId,
      publishedAt: "2026-09-16T12:00:00.000Z",
      updatedAt: "2026-09-16T12:00:00.000Z",
      attachments: [
        {
          type: "Image",
          mediaType: "image/png",
          url: "https://remote.example/media/1.png",
        },
      ],
      receivedAt: "2026-09-16T12:00:01.000Z",
    });
    store.saveFederationTimelineEntry({
      activityId: "https://remote.example/activities/create/1",
      actorId,
      type: "Create",
      objectId,
      publishedAt: "2026-09-16T12:00:00.000Z",
      receivedAt: "2026-09-16T12:00:01.000Z",
    });
    store.save("posts", "self-note", {
      kind: "tweet",
      title: "",
      body: "Self",
      tags: [],
      likes: 0,
      images: [],
      date: "2026-09-16T11:00:00.000Z",
      federationEnabled: true,
      federationUpdatedAt: "2026-09-16T11:00:00.000Z",
    });

    const first = ownerFederationTimeline(store, config, null, 1);
    assert.equal(first.items[0].source, "remote");
    assert.match(
      first.items[0].attachments[0].url,
      /^\/api\/federation\/media\/[a-f0-9]{64}$/,
    );
    assert.ok(first.nextCursor);
    const second = ownerFederationTimeline(store, config, first.nextCursor, 1);
    assert.equal(second.items[0].source, "self");
    assert.equal(second.nextCursor, null);

    const api = createAPI(store, config);
    assert.equal(
      (await api(new Request(`${origin}/api/federation/timeline`))).status,
      401,
    );
    const session = store.createSession();
    const response = await api(
      new Request(`${origin}/api/federation/timeline`, {
        headers: { cookie: `__Host-kamelog-session=${session}` },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.length, 2);
    assert.equal(
      (
        await api(
          new Request(`${origin}/api/federation/timeline?cursor=bad`, {
            headers: { cookie: `__Host-kamelog-session=${session}` },
          }),
        )
      ).status,
      400,
    );
    store.removeFederationFollowing(actorId);
    const afterUnfollow = ownerFederationTimeline(store, config, null, 30);
    assert.deepEqual(
      afterUnfollow.items.map(({ source }) => source),
      ["self"],
    );
  });
});

test("remote images are validated, cached locally and hidden after Delete", async () => {
  await withStore("kamelog-federation-media-", async (store) => {
    const actorId = "https://remote.example/users/alice";
    const objectId = "https://remote.example/notes/1";
    const remoteUrl = "https://remote.example/media/1.png";
    store.saveFederationRemoteObject({
      objectId,
      actorId,
      type: "Note",
      contentHtml: "<p>Image</p>",
      url: objectId,
      publishedAt: "2026-09-16T12:00:00.000Z",
      updatedAt: "2026-09-16T12:00:00.000Z",
      attachments: [{ type: "Image", mediaType: "image/png", url: remoteUrl }],
      receivedAt: "2026-09-16T12:00:01.000Z",
    });
    const mediaId = store.db
      .prepare("SELECT id FROM federation_remote_media WHERE object_id=?")
      .get(objectId).id;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    let requests = 0;
    let payload = Buffer.from("not an image");
    const options = {
      fetchOptions: {
        lookup: async () => [{ address: "8.8.8.8", family: 4 }],
        request: async () => {
          requests += 1;
          return { body: payload, contentType: "image/png" };
        },
      },
    };
    await assert.rejects(federationRemoteImage(store, mediaId, options));
    payload = png;
    assert.deepEqual(await federationRemoteImage(store, mediaId, options), {
      bytes: png,
      type: "image/png",
    });
    assert.deepEqual(await federationRemoteImage(store, mediaId, options), {
      bytes: png,
      type: "image/png",
    });
    assert.equal(requests, 2);
    const api = createAPI(store, config, { federation: options });
    assert.equal(
      (await api(new Request(`${origin}/api/federation/media/${mediaId}`)))
        .status,
      401,
    );
    const session = store.createSession();
    const imageResponse = await api(
      new Request(`${origin}/api/federation/media/${mediaId}`, {
        headers: { cookie: `__Host-kamelog-session=${session}` },
      }),
    );
    assert.equal(imageResponse.status, 200);
    assert.equal(imageResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);
    store.deleteFederationRemoteObject(
      objectId,
      actorId,
      "2026-09-16T12:01:00.000Z",
    );
    assert.equal(await federationRemoteImage(store, mediaId, options), null);
    await assert.rejects(
      readFile(join(store.directory, "federation-media", `${mediaId}.png`)),
    );
  });
});

test("delivery worker retries transient failures and signs each attempt", async () => {
  await withStore("kamelog-federation-worker-", async (store) => {
    createFederationIdentity(store, "kamesan");
    const post = {
      id: "worker-post",
      revision: 1,
      kind: "tweet",
      title: "",
      body: "queued",
      date: "2026-09-16T00:00:00.000Z",
      federationEnabled: true,
    };
    store.saveFederationFollower({
      actorId: "https://remote.example/users/alice",
      inboxUrl: "https://remote.example/inbox",
      followActivityId: "https://remote.example/follows/1",
      followedAt: post.date,
    });
    enqueuePostFederationTransition(
      store,
      config,
      post,
      null,
      new Date(post.date),
    );
    let signed = false;
    const first = await processNextFederationDelivery(store, config, {
      now: new Date("2026-09-16T00:00:01.000Z"),
      postActivity: async (url, body, sign) => {
        const headers = sign(new URL(url), body);
        signed = headers.signature.includes("#main-key");
        return { status: 503 };
      },
    });
    assert.equal(signed, true);
    assert.equal(first.state, "pending");
    assert.equal(store.federationDiagnostics().pendingDeliveries, 1);
    assert.equal(
      await processNextFederationDelivery(store, config, {
        now: new Date("2026-09-16T00:00:02.000Z"),
        postActivity: async () => ({ status: 202 }),
      }),
      null,
    );
    const completed = await processNextFederationDelivery(store, config, {
      now: new Date("2026-09-16T00:00:11.000Z"),
      postActivity: async () => ({ status: 202 }),
    });
    assert.equal(completed.state, "succeeded");
    assert.equal(store.federationDiagnostics().pendingDeliveries, 0);

    store.enqueueFederationActivity(
      {
        id: `${origin}/activitypub/activities/rejected`,
        type: "Delete",
        objectId: `${origin}/activitypub/objects/rejected`,
        body: { type: "Delete" },
        createdAt: "2026-09-16T00:00:12.000Z",
        nextAttemptAt: Date.parse("2026-09-16T00:00:12.000Z"),
      },
      ["https://remote.example/inbox"],
    );
    const rejected = await processNextFederationDelivery(store, config, {
      now: new Date("2026-09-16T00:00:12.000Z"),
      postActivity: async () => ({ status: 400 }),
    });
    assert.equal(rejected.state, "dead");
    assert.equal(store.federationDiagnostics().failedDeliveries, 1);
  });
});
