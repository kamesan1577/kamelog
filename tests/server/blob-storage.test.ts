import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  blobDigest,
  GatewayBlobStorage,
  getBlobStorage,
  LocalBlobStorage,
  type BlobStorage,
} from "../../server/storage/blobs.ts";
import { StorageError } from "../../server/storage/errors.ts";
import { Store } from "../../server/storage/local-store.ts";
import { command, convertVideo, saveImage } from "../../server/media.mjs";
import { backupStore, restoreBackup } from "../../server/backup.mjs";

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const token = "fictional-storage-test-token-000000000";
const generation = randomUUID();
const key = `media/${randomUUID()}.png`;

class MemoryBlobs implements BlobStorage {
  objects = new Map<string, Buffer>();
  failure?: StorageError;

  async get(objectKey: string) {
    const bytes = this.objects.get(objectKey);
    if (!bytes) throw new StorageError("storage_integrity");
    return Buffer.from(bytes);
  }

  async put(objectKey: string, bytes: Uint8Array) {
    if (this.failure) throw this.failure;
    this.objects.set(objectKey, Buffer.from(bytes));
  }

  async delete(objectKey: string) {
    this.objects.delete(objectKey);
  }
}

test("local blobs publish complete immutable bytes and reject paths and symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-local-"));
  try {
    const blobs = new LocalBlobStorage(root);
    await blobs.put(key, image);
    await blobs.put(key, image);
    assert.deepEqual(await blobs.get(key), image);
    assert.equal((await stat(join(root, key))).mode & 0o777, 0o600);
    await assert.rejects(
      blobs.put(key, Buffer.from("different bytes")),
      (error: unknown) =>
        error instanceof StorageError && error.code === "storage_conflict",
    );
    assert.deepEqual(await blobs.get(key), image);
    for (const unsafe of ["../secret", "media/../../secret", `${key}/other`])
      await assert.rejects(blobs.get(unsafe), StorageError);
    const linked = `media/${randomUUID()}.png`;
    await symlink(join(root, key), join(root, linked));
    await assert.rejects(blobs.get(linked));
    await assert.rejects(blobs.delete(linked), StorageError);
    await blobs.delete(key);
    await blobs.delete(key);
    await assert.rejects(blobs.get(key));
    assert.equal((await readdir(join(root, "media"))).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("local blobs refuse a media directory that points outside the data root", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-symlink-"));
  try {
    await mkdir(join(root, "data"));
    await mkdir(join(root, "outside"));
    await symlink(join(root, "outside"), join(root, "data", "media"));
    const blobs = new LocalBlobStorage(join(root, "data"));
    await assert.rejects(blobs.put(key, image), StorageError);
    assert.deepEqual(await readdir(join(root, "outside")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gateway blobs use private authenticated requests and verify both upload and download hashes", async () => {
  const calls: string[] = [];
  const blobs = new GatewayBlobStorage({
    endpoint: "https://storage.example.test",
    token,
    generation,
    fetch: async (input, init) => {
      assert.equal(String(input), `https://storage.example.test/blobs/${key}`);
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Authorization"), `Bearer ${token}`);
      assert.equal(headers.get("X-Storage-Generation"), generation);
      calls.push(init?.method || "GET");
      if (init?.method === "PUT") {
        assert.equal(headers.get("Content-Type"), "image/png");
        assert.equal(headers.get("X-Content-SHA256"), blobDigest(image));
        assert.deepEqual(
          Buffer.from(await new Response(init.body).arrayBuffer()),
          image,
        );
      }
      return new Response(init?.method === "GET" ? image : null, {
        headers: { "X-Content-SHA256": blobDigest(image) },
      });
    },
  });
  await blobs.put(key, image, "image/png");
  assert.deepEqual(await blobs.get(key), image);
  await blobs.delete(key);
  assert.deepEqual(calls, ["PUT", "GET", "DELETE"]);

  const corrupt = new GatewayBlobStorage({
    endpoint: "https://storage.example.test",
    token,
    generation,
    fetch: async () =>
      new Response("corrupt", {
        headers: { "X-Content-SHA256": blobDigest(image) },
      }),
  });
  await assert.rejects(
    corrupt.get(key),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_integrity",
  );
  const badAcknowledgement = new GatewayBlobStorage({
    endpoint: "https://storage.example.test",
    token,
    generation,
    fetch: async () => new Response(null),
  });
  await assert.rejects(
    badAcknowledgement.put(key, image, "image/png"),
    StorageError,
  );
});

test("gateway errors preserve quota classification without leaking provider bodies", async () => {
  for (const [status, expected] of [
    [429, "storage_limit"],
    [507, "storage_limit"],
    [409, "storage_conflict"],
    [423, "storage_migrating"],
    [500, "storage_unavailable"],
  ] as const) {
    const blobs = new GatewayBlobStorage({
      endpoint: "https://storage.example.test",
      token,
      generation,
      fetch: async () => new Response("PRIVATE PROVIDER BODY", { status }),
    });
    await assert.rejects(
      blobs.put(key, image, "image/png"),
      (error: unknown) => {
        assert.ok(error instanceof StorageError);
        assert.equal(error.code, expected);
        assert.ok(!error.message.includes("PRIVATE"));
        return true;
      },
    );
  }
  assert.throws(
    () =>
      new GatewayBlobStorage({
        endpoint: "http://storage.example.test",
        token,
        generation,
      }),
    StorageError,
  );
  assert.throws(
    () =>
      new GatewayBlobStorage({
        endpoint: "https://storage.example.test",
        token: "",
        generation,
      }),
    StorageError,
  );
  const platformLimit = new GatewayBlobStorage({
    endpoint: "https://storage.example.test",
    token,
    generation,
    fetch: async () =>
      new Response("<html><h1>Error <span>1027</span></h1></html>", {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }),
  });
  await assert.rejects(
    platformLimit.put(key, image, "image/png"),
    (error: unknown) =>
      error instanceof StorageError && error.code === "storage_limit",
  );
});

test("media uploads commit remote bytes first and backup restores them into another provider", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-backup-"));
  const blobs = new MemoryBlobs();
  const store = Object.assign(new Store(join(root, "source")), { blobs });
  try {
    const media = await saveImage(store, image, "image/png");
    const objectKey = `media/${media.id}.png`;
    assert.deepEqual(await blobs.get(objectKey), image);
    await assert.rejects(readFile(join(store.directory, objectKey)));
    assert.ok(store.get("media", media.id));
    await backupStore(store, join(root, "backup"));
    await restoreBackup(join(root, "backup"), join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    try {
      assert.deepEqual(await getBlobStorage(restored).get(objectKey), image);
      assert.deepEqual(
        restored.get("media", media.id),
        store.get("media", media.id),
      );
    } finally {
      restored.close();
    }
    blobs.failure = new StorageError("storage_limit");
    await assert.rejects(saveImage(store, image, "image/png"), StorageError);
    assert.equal(store.list("media").length, 1);
    assert.equal(blobs.objects.size, 1);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("confirmed metadata rollback removes upload but an unknown commit retains recoverable bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-rollback-"));
  const blobs = new MemoryBlobs();
  const store = Object.assign(new Store(root), { blobs });
  try {
    const originalSave = store.save.bind(store);
    store.save = () => {
      throw new Error("simulated database rollback");
    };
    await assert.rejects(saveImage(store, image, "image/png"));
    assert.equal(blobs.objects.size, 0);
    store.save = () => {
      throw new StorageError("storage_unavailable");
    };
    await assert.rejects(saveImage(store, image, "image/png"), StorageError);
    assert.equal(blobs.objects.size, 1);
    assert.equal(store.list("media").length, 0);
    store.save = (...args) => {
      originalSave(...args);
      throw new StorageError("storage_limit");
    };
    await assert.rejects(saveImage(store, image, "image/png"), StorageError);
    const saved = store.list("media")[0];
    assert.ok(saved);
    assert.deepEqual(await blobs.get(`media/${saved.id}.png`), image);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("backup media selection follows the immutable database snapshot during concurrent changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-backup-race-"));
  const blobs = new MemoryBlobs();
  const store = Object.assign(new Store(join(root, "source")), { blobs });
  try {
    const included = await saveImage(store, image, "image/png");
    const originalSnapshot = store.snapshot.bind(store);
    let addedId: string | undefined;
    store.snapshot = async (path: string) => {
      await originalSnapshot(path);
      store.remove("media", included.id);
      addedId = (await saveImage(store, image, "image/png")).id;
    };
    await backupStore(store, join(root, "backup"));
    const manifest = JSON.parse(
      await readFile(join(root, "backup", "manifest.json"), "utf8"),
    );
    assert.ok(manifest.files[`media/${included.id}.png`]);
    assert.equal(manifest.files[`media/${addedId}.png`], undefined);
    await restoreBackup(join(root, "backup"), join(root, "restored"));
    const restored = new Store(join(root, "restored"));
    try {
      assert.ok(restored.get("media", included.id));
      assert.equal(restored.get("media", addedId), null);
      assert.deepEqual(
        await getBlobStorage(restored).get(`media/${included.id}.png`),
        image,
      );
    } finally {
      restored.close();
    }
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("a backup missing a referenced object leaves the restore target empty", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-restore-failure-"));
  const store = new Store(join(root, "source"));
  try {
    const media = await saveImage(store, image, "image/png");
    const backup = join(root, "backup");
    await backupStore(store, backup);
    const manifest = JSON.parse(
      await readFile(join(backup, "manifest.json"), "utf8"),
    );
    delete manifest.files[`media/${media.id}.png`];
    await writeFile(join(backup, "manifest.json"), JSON.stringify(manifest));
    const target = join(root, "target");
    await assert.rejects(restoreBackup(backup, target), /Missing media/);
    assert.deepEqual(await readdir(target), []);
    assert.ok(
      !(await readdir(root)).some((name) =>
        name.startsWith(".kamelog-restore-"),
      ),
    );
    assert.ok(store.get("media", media.id));
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("converted videos are stored by the provider and leave only temporary processing files locally", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-blob-video-"));
  const blobs = new MemoryBlobs();
  const store = Object.assign(new Store(join(root, "source")), { blobs });
  try {
    const input = join(root, "fixture.mp4");
    await command("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=180x320:d=3",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      input,
    ]);
    const media = await convertVideo(store, await readFile(input), 2);
    const output = join(root, "downloaded.mp4");
    await writeFile(output, await blobs.get(`media/${media.id}.mp4`));
    const info = JSON.parse(
      await command("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        output,
      ]),
    );
    assert.equal(info.streams[0].width, 1280);
    assert.equal(info.streams[0].height, 720);
    assert.ok(Number(info.format.duration) <= 2.1);
    assert.ok(store.get("media", media.id));
    assert.deepEqual(await readdir(join(store.directory, "media")), []);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
