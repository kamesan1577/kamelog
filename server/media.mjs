import { spawn } from "node:child_process";
import { mkdtemp, writeFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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
