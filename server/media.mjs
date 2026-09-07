import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const imageTypes = {
  "image/png": {
    extension: "png",
    signature: (b) =>
      b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
  },
  "image/jpeg": {
    extension: "jpg",
    signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  "image/webp": {
    extension: "webp",
    signature: (b) =>
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP",
  },
  "image/gif": {
    extension: "gif",
    signature: (b) =>
      ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString()),
  },
};

function imageDimensions(bytes, type) {
  if (type === "image/png" && bytes.length >= 24)
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (type === "image/gif" && bytes.length >= 10)
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (type === "image/webp" && bytes.length >= 30) {
    const format = bytes.subarray(12, 16).toString();
    if (format === "VP8X")
      return {
        width: bytes.readUIntLE(24, 3) + 1,
        height: bytes.readUIntLE(27, 3) + 1,
      };
    if (
      format === "VP8 " &&
      bytes.subarray(23, 26).equals(Buffer.from("9d012a", "hex"))
    )
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    if (format === "VP8L" && bytes[20] === 0x2f)
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height:
          1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
  }
  if (type === "image/jpeg") {
    const sof = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    for (let offset = 2; offset + 8 < bytes.length;) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xd9 || marker === 0xda) return null;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) return null;
      if (sof.has(marker))
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      offset += 2 + length;
    }
  }
  return null;
}

export async function saveImage(store, bytes, declaredType) {
  const type = imageTypes[declaredType];
  if (
    !type ||
    bytes.length === 0 ||
    bytes.length > 12 * 1024 * 1024 ||
    !type.signature(bytes)
  )
    throw new Error("Invalid image");
  const dimensions = imageDimensions(bytes, declaredType);
  if (
    !dimensions.width ||
    !dimensions.height ||
    dimensions.width > 12000 ||
    dimensions.height > 12000 ||
    dimensions.width * dimensions.height > 40_000_000
  )
    throw new Error("Invalid image");
  const root = join(store.directory, "media");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const id = randomUUID();
  const metadata = {
    kind: "image",
    type: declaredType,
    extension: type.extension,
    size: bytes.length,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: new Date().toISOString(),
  };
  await writeFile(join(root, `${id}.${type.extension}`), bytes, {
    mode: 0o600,
  });
  store.save("media", id, metadata);
  return { id, url: "/api/media/" + id, ...metadata };
}

export function command(binary, args, timeout = 60_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, args, { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.stdout.on("data", (chunk) => {
      out += chunk.toString();
      if (out.length > 100_000) p.kill("SIGKILL");
    });
    p.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Media processor unavailable"));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error("Invalid or unsupported media"));
    });
  });
}
let active = false;
export async function convertVideo(store, bytes, seconds) {
  if (active) throw new Error("Media processor busy");
  if (![2, 5, 10, 30].includes(seconds)) throw new Error("Invalid duration");
  active = true;
  const root = join(store.directory, "media");
  await mkdir(root, { recursive: true, mode: 0o700 });
  let temp;
  try {
    temp = await mkdtemp(join(root, ".processing-"));
    const source = join(temp, "input");
    await writeFile(source, bytes, { mode: 0o600 });
    const info = JSON.parse(
      await command(
        "ffprobe",
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          source,
        ],
        10_000,
      ),
    );
    const video = info.streams?.find((s) => s.codec_type === "video");
    const duration = Number(info.format?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 600 ||
      video.width > 7680 ||
      video.height > 7680 ||
      !/(mp4|mov|matroska|webm)/.test(info.format?.format_name || "")
    )
      throw new Error("Invalid media");
    const id = randomUUID(),
      output = join(temp, "output.mp4");
    await command("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      source,
      "-t",
      String(seconds),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "25",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      "-map_metadata",
      "-1",
      output,
    ]);
    const metadata = {
      kind: "video",
      type: "video/mp4",
      extension: "mp4",
      size: (await stat(output)).size,
      seconds: Math.min(seconds, duration),
      createdAt: new Date().toISOString(),
    };
    await rename(output, join(root, id + ".mp4"));
    store.save("media", id, metadata);
    return { id, video: "/api/media/" + id, ...metadata };
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true });
    active = false;
  }
}
