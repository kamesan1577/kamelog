import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_IMAGE_EDGE = 2560;
const MIN_REENCODE_BYTES = 256 * 1024;

function hasPrivateMetadata(bytes, type) {
  if (type === "image/jpeg") {
    for (let offset = 2; offset + 4 <= bytes.length; ) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xe1, 0xed, 0xfe].includes(marker)) return true;
      offset += 2 + length;
    }
  } else if (type === "image/png") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) break;
      const chunk = bytes.toString("ascii", offset + 4, offset + 8);
      if (["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(chunk))
        return true;
      if (chunk === "IEND") break;
      offset = end;
    }
  } else if (type === "image/webp") {
    return (
      bytes.subarray(12, 16).toString() === "VP8X" &&
      Boolean(bytes[20] & 0x0c)
    );
  }
  return false;
}

function isAnimatedWebp(bytes, type) {
  return (
    type === "image/webp" &&
    bytes.subarray(12, 16).toString() === "VP8X" &&
    Boolean(bytes[20] & 0x02)
  );
}

// Server-side fallback only: the browser already resizes and encodes images.
// The caller validates MIME, signature and dimensions and removes workdir.
export async function optimizeImage(
  bytes,
  type,
  dimensions,
  workdir,
  command,
  validateImage,
) {
  const original = {
    bytes,
    type,
    extension: dimensions.extension,
    width: dimensions.width,
    height: dimensions.height,
  };
  // Preserve animations rather than silently converting them into one frame.
  if (type === "image/gif" || isAnimatedWebp(bytes, type)) return original;

  const needsResize =
    Math.max(dimensions.width, dimensions.height) > MAX_IMAGE_EDGE;
  const needsMetadataRemoval = hasPrivateMetadata(bytes, type);
  // Browser-produced, metadata-free WebP is already optimized. Do not decode
  // and re-encode it: that wastes CPU and can degrade visual quality.
  if (
    !needsResize &&
    !needsMetadataRemoval &&
    (type === "image/webp" || bytes.length < MIN_REENCODE_BYTES)
  )
    return original;

  const source = join(workdir, `source.${dimensions.extension}`);
  const output = join(workdir, "optimized.webp");
  await writeFile(source, bytes, { mode: 0o600 });
  await command(
    "ffmpeg",
    [
      "-v",
      "error",
      "-nostdin",
      "-threads",
      "2",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      source,
      ...(needsResize
        ? ["-vf", "scale=2560:2560:force_original_aspect_ratio=decrease"]
        : []),
      "-frames:v",
      "1",
      "-an",
      "-map_metadata",
      "-1",
      "-c:v",
      "libwebp",
      "-quality",
      "84",
      "-compression_level",
      "4",
      "-pix_fmt",
      "yuva420p",
      output,
    ],
    20_000,
  );
  const converted = await readFile(output);
  const result = validateImage(converted, "image/webp");
  if (Math.max(result.width, result.height) > MAX_IMAGE_EDGE)
    throw new Error("Invalid image");
  if (!needsResize && !needsMetadataRemoval && converted.length >= bytes.length)
    return original;

  return {
    bytes: converted,
    type: "image/webp",
    extension: result.extension,
    width: result.width,
    height: result.height,
  };
}
