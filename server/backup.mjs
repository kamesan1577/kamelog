import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  copyFile,
  stat,
  lstat,
} from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { hash, Store } from "./store.mjs";

async function emptyTarget(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await readdir(directory)).length)
    throw new Error("Target must be empty");
}
export async function backupStore(store, target) {
  target = resolve(target);
  if (!relative(store.directory, target).startsWith(".."))
    throw new Error("Backup must be outside runtime data");
  await emptyTarget(target);
  await store.snapshot(join(target, "kamelog.sqlite"));
  await mkdir(join(target, "media"), { mode: 0o700 });
  const files = ["kamelog.sqlite"];
  for (const media of store.list("media")) {
    if (!/^[a-f0-9-]{36}$/.test(media.id)) throw new Error("Invalid media id");
    const file = "media/" + media.id + ".mp4";
    await copyFile(join(store.directory, file), join(target, file));
    files.push(file);
  }
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    files: {},
  };
  for (const file of files)
    manifest.files[file] = hash(await readFile(join(target, file)));
  await writeFile(
    join(target, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  return manifest;
}
export async function restoreBackup(source, target) {
  source = resolve(source);
  target = resolve(target);
  const manifest = JSON.parse(
    await readFile(join(source, "manifest.json"), "utf8"),
  );
  if (manifest.version !== 1 || !manifest.files?.["kamelog.sqlite"])
    throw new Error("Unsupported backup");
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (file !== "kamelog.sqlite" && !/^media\/[a-f0-9-]{36}\.mp4$/.test(file))
      throw new Error("Unsafe path");
    if (
      !(await lstat(join(source, file))).isFile() ||
      hash(await readFile(join(source, file))) !== digest
    )
      throw new Error("Backup checksum mismatch");
  }
  await emptyTarget(target);
  await mkdir(join(target, "media"), { mode: 0o700 });
  for (const file of Object.keys(manifest.files))
    await copyFile(join(source, file), join(target, file));
  const restored = new Store(target);
  try {
    if (
      restored.db.prepare("PRAGMA integrity_check").get().integrity_check !==
      "ok"
    )
      throw new Error("Invalid database");
    for (const media of restored.list("media")) {
      if (
        !/^[a-f0-9-]{36}$/.test(media.id) ||
        !manifest.files["media/" + media.id + ".mp4"]
      )
        throw new Error("Missing media");
      await stat(join(target, "media", media.id + ".mp4"));
    }
    for (const p of restored.list("posts")) {
      if (p.video && !restored.get("media", p.video.split("/").pop()))
        throw new Error("Dangling media reference");
    }
  } finally {
    restored.close();
  }
}
