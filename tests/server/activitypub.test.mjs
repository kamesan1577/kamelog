import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
} from "../../server/federation-fetch.mjs";
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
});
