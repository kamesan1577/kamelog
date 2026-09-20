import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, validateImage } from "../../server/media.mjs";
import { optimizeImage } from "../../server/image-optimizer.mjs";

test("browser-optimized WebP is stored byte-for-byte without another encoder run", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-no-double-encode-"));
  try {
    const path = join(root, "browser.webp");
    await command("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=s=800x600:r=1",
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      "88",
      path,
    ]);
    const bytes = await readFile(path);
    const metadata = validateImage(bytes, "image/webp");
    const result = await optimizeImage(
      bytes,
      "image/webp",
      metadata,
      root,
      () => {
        throw new Error("browser WebP must not be encoded again");
      },
      validateImage,
    );
    assert.strictEqual(result.bytes, bytes);
    assert.equal(result.type, "image/webp");
    assert.equal(result.width, 800);
    assert.equal(result.height, 600);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
