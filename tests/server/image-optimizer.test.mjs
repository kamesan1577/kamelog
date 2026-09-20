import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, saveImage } from "../../server/media.mjs";

const smallPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function fixture(root, name, args) {
  const file = join(root, name);
  await command("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", ...args, file]);
  return readFile(file);
}

function fakeStore(root, save = () => {}) {
  return { directory: root, save };
}

test("large JPEG is resized and compressed with matching storage metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-image-opt-"));
  const records = new Map();
  try {
    const original = await fixture(root, "large.jpg", [
      "testsrc2=s=3000x2000:r=1",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-threads",
      "2",
    ]);
    const image = await saveImage(
      fakeStore(root, (_table, id, metadata) => records.set(id, metadata)),
      original,
      "image/jpeg",
    );
    const saved = await readFile(join(root, "media", `${image.id}.webp`));
    assert.equal(image.type, "image/webp");
    assert.equal(image.extension, "webp");
    assert.equal(Math.max(image.width, image.height), 2560);
    assert.ok(image.size < original.length);
    assert.equal(saved.length, image.size);
    assert.equal(saved.subarray(8, 12).toString(), "WEBP");
    assert.deepEqual(records.get(image.id).size, saved.length);
    assert.deepEqual(await readdir(join(root, "media")), [`${image.id}.webp`]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("large PNG is resized and encoded as a smaller image", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-png-opt-"));
  try {
    const original = await fixture(root, "large.png", [
      "testsrc2=s=3000x1800:r=1",
      "-frames:v",
      "1",
      "-threads",
      "2",
    ]);
    const image = await saveImage(fakeStore(root), original, "image/png");
    assert.equal(image.type, "image/webp");
    assert.equal(Math.max(image.width, image.height), 2560);
    assert.ok(image.size < original.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JPEG EXIF content never survives the stored optimized output", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-exif-opt-"));
  try {
    const jpeg = await fixture(root, "photo.jpg", [
      "testsrc2=s=320x240:r=1",
      "-frames:v",
      "1",
      "-threads",
      "2",
    ]);
    const privateMarker = "fixture-private-exif-identifier";
    const payload = Buffer.from(`Exif\0\0${privateMarker}`);
    const length = Buffer.alloc(2);
    length.writeUInt16BE(payload.length + 2);
    const original = Buffer.concat([
      jpeg.subarray(0, 2),
      Buffer.from([0xff, 0xe1]),
      length,
      payload,
      jpeg.subarray(2),
    ]);
    const image = await saveImage(fakeStore(root), original, "image/jpeg");
    const saved = await readFile(join(root, "media", `${image.id}.webp`));
    assert.equal(image.type, "image/webp");
    assert.equal(saved.includes(Buffer.from(privateMarker)), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("animated GIF and animated WebP retain their complete original bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-animation-opt-"));
  try {
    const gif = await fixture(root, "animation.gif", [
      "testsrc2=s=48x32:r=2:d=1",
      "-loop",
      "0",
    ]);
    const gifImage = await saveImage(fakeStore(root), gif, "image/gif");
    assert.equal(gifImage.type, "image/gif");
    assert.deepEqual(
      await readFile(join(root, "media", `${gifImage.id}.gif`)),
      gif,
    );
    const webp = await fixture(root, "animation.webp", [
      "testsrc2=s=48x32:r=2:d=1",
      "-c:v",
      "libwebp_anim",
      "-loop",
      "0",
    ]);
    assert.equal(webp.subarray(12, 16).toString(), "VP8X");
    assert.ok(webp[20] & 0x02);
    const webpImage = await saveImage(fakeStore(root), webp, "image/webp");
    assert.equal(webpImage.type, "image/webp");
    assert.deepEqual(
      await readFile(join(root, "media", `${webpImage.id}.webp`)),
      webp,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tiny original remains unchanged and persistence failures leave no files", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-image-atomic-"));
  try {
    const result = await saveImage(fakeStore(root), smallPng, "image/png");
    assert.equal(result.type, "image/png");
    assert.deepEqual(
      await readFile(join(root, "media", `${result.id}.png`)),
      smallPng,
    );
    await rm(join(root, "media", `${result.id}.png`));
    await assert.rejects(
      saveImage(
        fakeStore(root, () => {
          throw new Error("fixture persistence failure");
        }),
        smallPng,
        "image/png",
      ),
    );
    assert.deepEqual(await readdir(join(root, "media")), []);
    await writeFile(join(root, "dummy"), "data");
    await assert.rejects(saveImage(fakeStore(root), Buffer.from("bad"), "image/png"));
    assert.deepEqual(await readdir(join(root, "media")), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
