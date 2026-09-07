import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../server/store.mjs";
import { command, convertVideo, saveImage } from "../../server/media.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

test("validate image content and persist safe metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-image-"));
  const store = new Store(root);
  try {
    await assert.rejects(
      saveImage(store, Buffer.from("not an image"), "image/png"),
    );
    await assert.rejects(saveImage(store, png, "image/jpeg"));
    const image = await saveImage(store, png, "image/png");
    assert.equal(image.type, "image/png");
    assert.equal(image.width, 1);
    assert.equal(image.height, 1);
    assert.deepEqual(
      await readFile(join(root, "media", image.id + ".png")),
      png,
    );
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("reject fake video and convert actual portrait video to 16:9", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-video-")),
    store = new Store(join(root, "data"));
  try {
    await assert.rejects(convertVideo(store, Buffer.from("not a video"), 2));
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
    const result = await convertVideo(store, await readFile(input), 2);
    const info = JSON.parse(
      await command("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        join(store.directory, "media", result.id + ".mp4"),
      ]),
    );
    assert.equal(info.streams[0].width, 1280);
    assert.equal(info.streams[0].height, 720);
    assert.ok(Number(info.format.duration) <= 2.1);
    assert.ok(store.get("media", result.id));
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
