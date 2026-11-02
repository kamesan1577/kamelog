import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import {
  MessageChannel,
  receiveMessageOnPort,
  Worker,
} from "node:worker_threads";
import { z } from "zod";
import { Store, Conflict } from "./local-store.ts";
import { GatewayBlobStorage } from "./blobs.ts";
import { StorageError, storageErrorCodes } from "./errors.ts";
import {
  decodeWire,
  encodeWire,
  PUBLIC_METHODS,
  selectorSchema,
} from "./protocol.ts";

const transportSchema = z.object({
  transportError: z.enum(storageErrorCodes).optional(),
  status: z.number().optional(),
  body: z.unknown().optional(),
});
const rpcSchema = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({ code: z.string(), name: z.string().optional() }).optional(),
});

export interface GatewayOptions {
  endpoint: string;
  token: string;
  generation: string;
}

/** Provider-neutral repository operations; Cloudflare-specific SQL stays behind RPC. */
export function openStore(
  directory: string,
  env: NodeJS.ProcessEnv = process.env,
): Store {
  const root = resolve(directory);
  if (existsSync(join(root, "storage-maintenance.json")))
    throw new StorageError("storage_migrating");
  const selectorPath = join(root, "storage.json");
  if (!existsSync(selectorPath)) return new Store(root);
  let selection: z.infer<typeof selectorSchema>;
  try {
    const raw: unknown = JSON.parse(readFileSync(selectorPath, "utf8"));
    if (
      z
        .object({ version: z.literal(1), provider: z.literal("local") })
        .strict()
        .safeParse(raw).success
    )
      return new Store(root);
    selection = selectorSchema.parse(raw);
  } catch {
    throw new StorageError("storage_configuration");
  }
  const endpoint = env.KAMELOG_STORAGE_ENDPOINT || "";
  const token = env.KAMELOG_STORAGE_TOKEN || "";
  const options = { endpoint, token, generation: selection.generation };
  // Validation is shared with the object adapter; only HTTPS origins are accepted.
  const blobs = new GatewayBlobStorage(options);
  const cache = join(
    tmpdir(),
    `kamelog-${createHash("sha256").update(root).digest("hex").slice(0, 16)}`,
    selection.generation,
  );
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const channel = new MessageChannel();
  const worker = new Worker(
    join(process.cwd(), "server/storage/rpc-worker.ts"),
    {
      workerData: { ...options, port: channel.port2 },
      transferList: [channel.port2],
    },
  );
  worker.unref();
  channel.port1.unref();
  // Prevent an unhandled Worker error from terminating a server with private data.
  let failed = false;
  worker.on("error", () => {
    failed = true;
  });
  const assertCurrent = () => {
    if (existsSync(join(root, "storage-maintenance.json")))
      throw new StorageError("storage_migrating");
    try {
      const current = selectorSchema.parse(
        JSON.parse(readFileSync(selectorPath, "utf8")),
      );
      if (current.generation !== selection.generation) throw new Error();
    } catch {
      throw new StorageError("storage_migrating");
    }
  };
  const call = (method: string, args: unknown[]) => {
    assertCurrent();
    if (method === "authenticated" && !args[0]) return false;
    if (failed) throw new StorageError("storage_unavailable");
    const signal = new SharedArrayBuffer(4);
    channel.port1.postMessage({
      signal,
      body: JSON.stringify({
        requestId: randomUUID(),
        issuedAt: Date.now(),
        method,
        args: encodeWire(args),
      }),
    });
    if (Atomics.wait(new Int32Array(signal), 0, 0, 45_000) === "timed-out") {
      failed = true;
      void worker.terminate();
      throw new StorageError("storage_unavailable");
    }
    const message = transportSchema.safeParse(
      receiveMessageOnPort(channel.port1)?.message,
    );
    if (!message.success) throw new StorageError("storage_integrity");
    if (message.data.transportError)
      throw new StorageError(message.data.transportError);
    const response = rpcSchema.safeParse(message.data.body);
    if (!response.success) throw new StorageError("storage_unavailable");
    if (!response.data.ok) {
      const code = response.data.error?.code;
      if (code === "conflict" || response.data.error?.name === "Conflict")
        throw new Conflict("Revision conflict");
      const known = z.enum(storageErrorCodes).safeParse(code);
      if (known.success) throw new StorageError(known.data);
      if (code === "invalid_input") throw new TypeError("Invalid input");
      throw new StorageError("storage_unavailable");
    }
    return decodeWire(response.data.result);
  };
  const methods = new Set<string>(PUBLIC_METHODS);
  const target = {
    provider: "cloudflare",
    directory: cache,
    blobs,
    command: (name: string, args: unknown[]) => call("$command", [name, args]),
    close: () => {
      channel.port1.close();
      void worker.terminate();
    },
    snapshot: async (path: string) => {
      assertCurrent();
      const { exportCloudDatabase } = await import("./migration.ts");
      await exportCloudDatabase(options, path);
    },
  };
  // The fixed allowlist implements the core's public synchronous method contract.
  // DB handles and callback transactions are deliberately unavailable remotely.
  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === "string" && methods.has(property))
        return (...args: unknown[]) => call(property, args);
      return Reflect.get(object, property, receiver);
    },
  }) as unknown as Store;
}
