// Run against `wrangler dev --local` only. Never accepts a production origin.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/storage/local-store.ts";
import { LocalBlobStorage } from "../../server/storage/blobs.ts";
import {
  GatewayMigrationTarget,
  exportCloudArchive,
  migrateStorage,
  restoreStorageArchive,
} from "../../server/storage/migration.ts";
import { decodeWire, encodeWire } from "../../server/storage/protocol.ts";
import { z } from "zod";

const localOrigin = new URL(
  process.env.KAMELOG_WORKER_TEST_ORIGIN || "http://localhost:8789",
);
if (
  localOrigin.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(localOrigin.hostname)
)
  throw new Error("This test requires a local workerd origin");
const token = "fictional-storage-test-token-00000000000000";
const request: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  return fetch(new URL(url.pathname + url.search, localOrigin), init);
};

const directory = await mkdtemp(join(tmpdir(), "kamelog-workerd-smoke-"));
const source = join(directory, "source");
const generation = randomUUID();
const options = {
  endpoint: "https://fictional-storage.example",
  token,
  generation,
  fetch: request,
};
const mediaId = randomUUID();
const mediaKey = `media/${mediaId}.png`;
// Cross multiple SQLite chunks during migration, verification and restoration.
const mediaBytes = Buffer.alloc(2 * 1024 * 1024 + 31, 17);
let store: Store | undefined = new Store(source);

async function rpc(method: string, args: unknown[], requestId = randomUUID()) {
  const response = await request(new URL("/rpc", options.endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Storage-Generation": generation,
    },
    body: JSON.stringify({
      requestId,
      issuedAt: Date.now(),
      method,
      args: args.map(encodeWire),
    }),
  });
  assert.equal(response.status, 200, `RPC ${method} failed`);
  const payload = z
    .object({ ok: z.literal(true), result: z.unknown() })
    .parse(await response.json());
  return decodeWire(payload.result);
}

try {
  store.save("media", mediaId, {
    kind: "image",
    extension: "png",
    type: "image/png",
    size: mediaBytes.length,
  });
  await new LocalBlobStorage(source).put(mediaKey, mediaBytes);
  store.save("posts", "fixture-post", {
    kind: "tweet",
    body: "existing fixture post",
    date: "2026-01-01T00:00:00.000Z",
    images: [`/api/media/${mediaId}`],
    tags: ["fixture"],
  });
  store.save("drafts", "fixture-draft", {
    kind: "tweet",
    body: "private fixture draft",
  });
  store.save("credentials", "fixture-credential", {
    publicKey: "fictional-key",
    counter: 7,
  });
  store.createFederationIdentity({
    username: "fixture",
    publicKeyPem: "fictional-public-key",
    privateKeyPem: "fictional-private-key",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  store.saveInferenceSettings({ autoThreadEnabled: true });
  const session = store.createSession();
  store.enqueueFederationActivity(
    {
      id: "https://example.test/activity/existing",
      type: "Create",
      objectId: "fixture-post",
      body: { type: "Create", object: "fixture-post" },
      createdAt: "2026-01-01T00:00:00.000Z",
      nextAttemptAt: 1,
    },
    ["https://remote.example/inbox"],
  );
  // Retain a historical AUTOINCREMENT high-water mark larger than current IDs.
  store.db
    .prepare(
      "UPDATE sqlite_sequence SET seq=137 WHERE name='federation_deliveries'",
    )
    .run();
  store.close();
  store = undefined;

  await migrateStorage({
    source,
    backupDirectory: join(directory, "backup"),
    generation,
    target: (selectedGeneration) =>
      new GatewayMigrationTarget({
        ...options,
        generation: selectedGeneration,
      }),
  });
  const selector = JSON.parse(
    await readFile(join(source, "storage.json"), "utf8"),
  );
  assert.equal(selector.provider, "cloudflare");
  assert.equal(selector.generation, generation);
  console.log("workerd: full migration and atomic selector switch passed");

  assert.equal(
    z
      .object({ body: z.string() })
      .parse(await rpc("get", ["posts", "fixture-post"])).body,
    "existing fixture post",
  );
  assert.equal(
    z
      .object({ body: z.string() })
      .parse(await rpc("get", ["drafts", "fixture-draft"])).body,
    "private fixture draft",
  );
  assert.equal(
    z
      .object({ privateKeyPem: z.string() })
      .parse(await rpc("federationIdentity", [])).privateKeyPem,
    "fictional-private-key",
  );
  const blobs = new GatewayMigrationTarget(options).blobs;
  assert.deepEqual(await blobs.get(mediaKey), mediaBytes);
  // Exercise the existing 64 MiB media boundary on the real isolate. The private
  // media object accepts streams and serves verified chunks without concatenation.
  const boundaryBlobs = new GatewayMigrationTarget({
    ...options,
    generation: randomUUID(),
  }).blobs;
  const boundaryKey = `media/${randomUUID()}.mp4`;
  const boundaryBytes = Buffer.alloc(64 * 1024 * 1024, 37);
  boundaryBytes[boundaryBytes.length - 1] = 91;
  await boundaryBlobs.put(boundaryKey, boundaryBytes, "video/mp4");
  await boundaryBlobs.put(boundaryKey, boundaryBytes, "video/mp4");
  assert.equal(
    (await boundaryBlobs.get(boundaryKey)).equals(boundaryBytes),
    true,
  );
  await boundaryBlobs.delete(boundaryKey);
  await assert.rejects(boundaryBlobs.get(boundaryKey), {
    code: "storage_integrity",
  });
  console.log(
    "workerd: SQLite multipart media, 64 MiB boundary, immutable retry and deletion passed",
  );
  assert.equal(await rpc("authenticated", [session]), true);
  await rpc("enqueueFederationActivity", [
    {
      id: "https://example.test/activity/after-migration",
      type: "Create",
      objectId: "fixture-post",
      body: { type: "Create", object: "fixture-post" },
      createdAt: "2026-01-02T00:00:00.000Z",
      nextAttemptAt: 2,
    },
    ["https://remote.example/inbox"],
  ]);
  const oldDelivery = z
    .object({ id: z.number() })
    .parse(await rpc("claimFederationDelivery", [Date.now()]));
  const newDelivery = z
    .object({ id: z.number() })
    .parse(await rpc("claimFederationDelivery", [Date.now()]));
  assert.equal(oldDelivery.id, 1);
  assert.equal(newDelivery.id, 138);

  const id = randomUUID();
  const saveArgs = [
    "saveContent",
    [
      {
        table: "posts",
        id: "cloud-post",
        value: {
          kind: "tweet",
          body: "created in workerd",
          date: "2026-01-02T00:00:00.000Z",
          tags: ["cloud"],
        },
        config: { origin: "https://example.test" },
      },
    ],
  ];
  const first = await rpc("$command", saveArgs, id);
  const repeated = await rpc("$command", saveArgs, id);
  assert.deepEqual(first, repeated);
  assert.equal(z.object({ revision: z.number() }).parse(first).revision, 1);
  // Force a SQL constraint failure after the post insert to exercise actual
  // workerd nested rollback, rather than rejecting malformed data at dispatch.
  const rollback = await request(new URL("/rpc", options.endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Storage-Generation": generation,
    },
    body: JSON.stringify({
      requestId: randomUUID(),
      issuedAt: Date.now(),
      method: "$command",
      args: [
        "saveContent",
        [
          {
            table: "posts",
            id: "rolled-back-post",
            value: { kind: "tweet", body: "rollback fixture", tags: [null] },
            config: { origin: "https://example.test" },
          },
        ],
      ],
    }),
  });
  assert.equal(rollback.ok, false);
  assert.equal(await rpc("get", ["posts", "rolled-back-post"]), null);
  const jobs = z
    .array(z.object({ post_id: z.string() }))
    .parse(await rpc("claimInferenceJobs", ["thread", Date.now(), 20]));
  assert.equal(jobs.filter((job) => job.post_id === "cloud-post").length, 1);
  console.log(
    "workerd: nested transaction, durable queue and receipt replay passed",
  );

  await exportCloudArchive(options, join(directory, "cloud-backup"));
  await restoreStorageArchive(
    join(directory, "cloud-backup"),
    join(directory, "restored"),
  );
  store = new Store(join(directory, "restored"));
  assert.equal(store.get("posts", "cloud-post")?.body, "created in workerd");
  assert.equal(
    store.get("drafts", "fixture-draft")?.body,
    "private fixture draft",
  );
  assert.equal(store.get("credentials", "fixture-credential")?.counter, 7);
  assert.equal(
    store.federationIdentity()?.privateKeyPem,
    "fictional-private-key",
  );
  assert.deepEqual(
    await new LocalBlobStorage(join(directory, "restored")).get(mediaKey),
    mediaBytes,
  );
  console.log(
    "workerd: current cloud state exported and restored to local SQLite/media",
  );
} finally {
  store?.close();
  await rm(directory, { recursive: true, force: true });
}
