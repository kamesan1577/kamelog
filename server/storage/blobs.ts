import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { StorageError } from "./errors.ts";
import { storageHttpError } from "./http-errors.ts";

/** Private objects. Authorization belongs to the caller, never to a public URL. */
export interface BlobStorage {
  get(key: string): Promise<Buffer>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export function validateBlobKey(key: string): string {
  if (!/^media\/[a-f0-9-]{36}\.(mp4|png|jpg|webp|gif)$/.test(key))
    throw new StorageError("storage_integrity");
  return key;
}

export function blobDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/** Immutable object IDs make metadata commits and provider migration reversible. */
export class LocalBlobStorage implements BlobStorage {
  readonly directory: string;

  constructor(directory: string) {
    this.directory = resolve(directory);
  }

  private async path(key: string, create: boolean): Promise<string> {
    const path = join(this.directory, validateBlobKey(key));
    const parent = dirname(path);
    if (create) await mkdir(parent, { recursive: true, mode: 0o700 });
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new StorageError("storage_integrity");
    return path;
  }

  async get(key: string): Promise<Buffer> {
    const path = await this.path(key, false);
    let file: FileHandle | undefined;
    try {
      file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      if (!(await file.stat()).isFile())
        throw new StorageError("storage_integrity");
      return await file.readFile();
    } finally {
      await file?.close();
    }
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const path = await this.path(key, true);
    const temporary = join(dirname(path), `.upload-${randomUUID()}`);
    try {
      await writeFile(temporary, bytes, {
        flag: "wx",
        mode: 0o600,
        flush: true,
      });
      try {
        // A hard link publishes the complete object without replacing an old ID.
        await link(temporary, path);
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
        if (blobDigest(await this.get(key)) !== blobDigest(bytes))
          throw new StorageError("storage_conflict");
      }
      const directory = await open(dirname(path), constants.O_RDONLY);
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const path = await this.path(key, false);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink())
        throw new StorageError("storage_integrity");
      await rm(path);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
}

interface GatewayBlobOptions {
  endpoint: string;
  token: string;
  generation: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** HTTP object port; the gateway may use R2 or another private object provider. */
export class GatewayBlobStorage implements BlobStorage {
  private readonly endpoint: URL;
  private readonly token: string;
  private readonly generation: string;
  private readonly request: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: GatewayBlobOptions) {
    this.endpoint = new URL(options.endpoint);
    if (
      this.endpoint.protocol !== "https:" ||
      this.endpoint.username ||
      this.endpoint.password ||
      this.endpoint.search ||
      this.endpoint.hash ||
      this.endpoint.pathname !== "/" ||
      options.token.length < 32 ||
      /[\r\n]/.test(options.token) ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        options.generation,
      )
    )
      throw new StorageError("storage_configuration");
    this.token = options.token;
    this.generation = options.generation;
    this.request = options.fetch || fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async send(
    key: string,
    method: "GET" | "PUT" | "DELETE",
    bytes?: Uint8Array,
    contentType?: string,
  ): Promise<Response> {
    validateBlobKey(key);
    const headers = new Headers({
      Authorization: `Bearer ${this.token}`,
      "X-Storage-Generation": this.generation,
    });
    if (bytes) {
      headers.set("Content-Type", contentType || "application/octet-stream");
      headers.set("Content-Length", String(bytes.byteLength));
      headers.set("X-Content-SHA256", blobDigest(bytes));
    }
    let response: Response;
    try {
      response = await this.request(new URL(`/blobs/${key}`, this.endpoint), {
        method,
        headers,
        body: bytes ? new Uint8Array(bytes) : undefined,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
      });
    } catch {
      throw new StorageError("storage_unavailable");
    }
    if (method === "DELETE" && response.status === 404) return response;
    if (!response.ok) {
      const code = storageHttpError(
        response.status,
        await response.text().catch(() => ""),
      );
      if (code) throw new StorageError(code);
      if (response.status === 404) throw new StorageError("storage_integrity");
      throw new StorageError("storage_unavailable");
    }
    return response;
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.send(key, "GET");
    let bytes: Buffer;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      throw new StorageError("storage_unavailable");
    }
    if (response.headers.get("X-Content-SHA256") !== blobDigest(bytes))
      throw new StorageError("storage_integrity");
    return bytes;
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    const response = await this.send(key, "PUT", bytes, contentType);
    if (response.headers.get("X-Content-SHA256") !== blobDigest(bytes))
      throw new StorageError("storage_integrity");
  }

  async delete(key: string): Promise<void> {
    await this.send(key, "DELETE");
  }
}

interface BlobOwner {
  directory: string;
  blobs?: BlobStorage;
}

const localAdapters = new WeakMap<BlobOwner, BlobStorage>();

export function getBlobStorage(store: BlobOwner): BlobStorage {
  if (store.blobs) return store.blobs;
  let adapter = localAdapters.get(store);
  if (!adapter) {
    adapter = new LocalBlobStorage(store.directory);
    localAdapters.set(store, adapter);
  }
  return adapter;
}

/** Retain bytes if the DB may have committed despite a lost acknowledgement. */
export function metadataCommitMayBeUnknown(error: unknown): boolean {
  return (
    error instanceof StorageError &&
    // A retry can encounter a quota rejection after the first request committed
    // and its acknowledgement was lost. Keep the object in either case.
    (error.code === "storage_unavailable" || error.code === "storage_limit")
  );
}
