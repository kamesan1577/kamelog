import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = await mkdtemp(join(tmpdir(), "kamelog-workerd-check-"));
const controller = new AbortController();
const interrupt = () =>
  controller.abort(new Error("Storage integration interrupted"));
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Local test port unavailable");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function exited(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`Storage integration process failed (${signal || code})`),
        );
    });
  });
}

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, name);
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ESRCH"
      ))
        throw error;
    }
  };
  const stopped = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  signal("SIGTERM");
  const force = setTimeout(() => signal("SIGKILL"), 2_000);
  try {
    await stopped;
  } finally {
    clearTimeout(force);
  }
}

let worker: ChildProcess | undefined;
let smoke: ChildProcess | undefined;
let output = "";
try {
  const port = await freePort();
  let inspectorPort = await freePort();
  while (inspectorPort === port) inspectorPort = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    CI: "true",
    WRANGLER_SEND_METRICS: "false",
    XDG_CONFIG_HOME: join(directory, "config"),
    CLOUDFLARE_API_TOKEN: undefined,
    CLOUDFLARE_API_KEY: undefined,
    CLOUDFLARE_EMAIL: undefined,
    CLOUDFLARE_ACCOUNT_ID: undefined,
  };
  worker = spawn(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--local",
      "--config",
      "cloudflare/wrangler.jsonc",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(inspectorPort),
      "--persist-to",
      join(directory, "state"),
      "--var",
      "STORAGE_TOKEN:fictional-storage-test-token-00000000000000",
      "--log-level",
      "warn",
    ],
    { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let startupError: Error | undefined;
  worker.once("error", (error) => {
    startupError = error;
  });
  const capture = (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-16_384);
  };
  worker.stdout?.on("data", capture);
  worker.stderr?.on("data", capture);
  const deadline = Date.now() + 60_000;
  while (true) {
    controller.signal.throwIfAborted();
    if (startupError) throw startupError;
    if (worker.exitCode !== null || worker.signalCode !== null)
      throw new Error("Local workerd exited before readiness");
    try {
      const response = await fetch(`${origin}/rpc`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.status === 401) break;
    } catch {
      /* Wait for the local server to bind its port. */
    }
    if (Date.now() >= deadline)
      throw new Error("Local workerd readiness timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  smoke = spawn(
    process.execPath,
    [join(root, "tests/integration/storage-workerd.ts")],
    {
      cwd: root,
      env: { ...env, KAMELOG_WORKER_TEST_ORIGIN: origin },
      detached: true,
      stdio: "inherit",
      signal: controller.signal,
    },
  );
  await exited(smoke);
} catch (error) {
  if (output) console.error(output);
  throw error;
} finally {
  await stop(smoke);
  await stop(worker);
  await rm(directory, { recursive: true, force: true });
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
}
