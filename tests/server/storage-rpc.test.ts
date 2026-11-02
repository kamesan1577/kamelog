import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:https";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { encodeWire } from "../../server/storage/protocol.ts";

const execute = promisify(execFile);
const requestSchema = z.object({
  requestId: z.uuid(),
  method: z.string(),
  args: z.array(z.unknown()),
});

test("real TLS RPC preserves values, retries unknown acknowledgements once and fences stale processes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-rpc-transport-"));
  const key = join(root, "key.pem");
  const cert = join(root, "cert.pem");
  const directory = join(root, "data");
  const generation = randomUUID();
  const received: string[] = [];
  const sessions = new Map<string, string>();
  let sessionAttempts = 0;
  let assertionFailure: unknown;
  await mkdir(directory, { mode: 0o700 });
  await writeFile(
    join(directory, "storage.json"),
    JSON.stringify({ version: 1, provider: "cloudflare", generation }),
    { mode: 0o600 },
  );
  await execute("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ]);
  const server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (req, res) => {
      try {
        assert.equal(req.url, "/rpc");
        assert.equal(req.method, "POST");
        assert.equal(
          req.headers.authorization,
          "Bearer fictional-storage-rpc-token-0000000000",
        );
        assert.equal(req.headers["x-storage-generation"], generation);
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const input = requestSchema.parse(
          JSON.parse(Buffer.concat(chunks).toString()),
        );
        received.push(input.method);
        res.setHeader("Content-Type", "application/json");
        const success = (result: unknown) =>
          res.end(JSON.stringify({ ok: true, result: encodeWire(result) }));
        if (input.method === "schemaVersion") return success(12);
        if (input.method === "get")
          return success({
            name: "架空のプロフィール",
            when: new Date("2026-01-01T00:00:00.000Z"),
            bytes: new Uint8Array([0, 127, 255]),
            count: BigInt("9007199254740993"),
            optional: undefined,
          });
        if (input.method === "createSession") {
          sessionAttempts++;
          if (!sessions.has(input.requestId)) {
            sessions.set(input.requestId, "fictional-session");
            // A committed write whose acknowledgement was lost must reuse its ID.
            req.socket.destroy();
            return;
          }
          return success(sessions.get(input.requestId));
        }
        if (input.method === "save" && input.args[0] === "posts") {
          res.statusCode = 409;
          res.end(
            JSON.stringify({
              ok: false,
              error: { code: "conflict", name: "Conflict" },
            }),
          );
          return;
        }
        if (input.method === "save" && input.args[0] === "drafts") {
          res.statusCode = 507;
          res.end("provider private quota details");
          return;
        }
        if (input.method === "authenticated") {
          res.statusCode = 500;
          res.end(JSON.stringify({ private: "unexpected provider envelope" }));
          return;
        }
        if (input.method === "federationDiagnostics") {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/html");
          res.end(
            "<!doctype html><h1>Error <span>1027</span></h1><p>Worker exceeded a daily limit.</p>",
          );
          return;
        }
        throw new Error("Unexpected test operation");
      } catch (error) {
        assertionFailure = error;
        res.statusCode = 500;
        res.end("fixture failure");
      }
    },
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "tests/server/fixtures/storage-rpc-client.ts",
          directory,
          `https://127.0.0.1:${address.port}`,
          generation,
          randomUUID(),
        ],
        {
          cwd: process.cwd(),
          env: { ...process.env, NODE_EXTRA_CA_CERTS: cert },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("RPC fixture timed out"));
      }, 60_000);
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("exit", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(stdout);
        else reject(new Error(`RPC fixture failed: ${stderr}`));
      });
    });
    assert.equal(assertionFailure, undefined);
    assert.match(output, /rpc-client-passed/);
    assert.equal(sessionAttempts, 2);
    assert.equal(sessions.size, 1);
    assert.deepEqual(received, [
      "schemaVersion",
      "get",
      "createSession",
      "createSession",
      "save",
      "save",
      "authenticated",
      "federationDiagnostics",
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
