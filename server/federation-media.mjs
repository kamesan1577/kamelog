import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { fetchFederationDocument } from "./federation-fetch.mjs";
import { validateImage } from "./media.mjs";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 256 * 1024 * 1024;
const active = new Map();

function cachePath(store, media) {
  if (!/^[a-f0-9]{64}$/.test(media.id)) throw new Error("Invalid media id");
  if (!/^(png|jpg|webp|gif)$/.test(media.extension || ""))
    throw new Error("Invalid media extension");
  return join(
    store.directory,
    "federation-media",
    `${media.id}.${media.extension}`,
  );
}

async function trimCache(directory, keep) {
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    return;
  }
  const files = [];
  for (const name of entries) {
    if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(name)) continue;
    const path = join(directory, name);
    try {
      const details = await stat(path);
      files.push({ path, size: details.size, modified: details.mtimeMs });
    } catch {}
  }
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files.sort((a, b) => a.modified - b.modified)) {
    if (total <= MAX_CACHE_BYTES) break;
    if (file.path === keep) continue;
    await rm(file.path, { force: true });
    total -= file.size;
  }
}

async function cached(store, media) {
  if (!media.cachedType || !media.extension) return null;
  try {
    return {
      bytes: await readFile(cachePath(store, media)),
      type: media.cachedType,
    };
  } catch {
    return null;
  }
}

async function fetchAndCache(store, media, options) {
  const existing = await cached(store, media);
  if (existing) return existing;
  const response = await fetchFederationDocument(media.remoteUrl, {
    ...options.fetchOptions,
    maxBytes: MAX_IMAGE_BYTES,
    contentTypes: IMAGE_TYPES,
    accept: IMAGE_TYPES.join(", "),
  });
  const type = response.contentType;
  if (!IMAGE_TYPES.includes(type)) throw new Error("Invalid remote image");
  const validated = validateImage(response.body, type, MAX_IMAGE_BYTES);
  if (!store.federationRemoteMedia(media.id)) return null;
  const directory = join(store.directory, "federation-media");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = join(directory, `${media.id}.${validated.extension}`);
  const temporary = join(directory, `.${media.id}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, response.body, { mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  store.cacheFederationRemoteMedia(media.id, {
    type,
    extension: validated.extension,
    size: response.body.length,
    cachedAt: new Date().toISOString(),
  });
  await trimCache(directory, target);
  return { bytes: response.body, type };
}

export async function federationRemoteImage(store, id, options = {}) {
  const media = store.federationRemoteMedia(id);
  if (!media) return null;
  const activeKey = `${store.directory}\0${id}`;
  if (!active.has(activeKey)) {
    const pending = fetchAndCache(store, media, options).finally(() =>
      active.delete(activeKey),
    );
    active.set(activeKey, pending);
  }
  const result = await active.get(activeKey);
  return store.federationRemoteMedia(id) ? result : null;
}
