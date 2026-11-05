import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runDeliveryLoop } from "../../server/federation-worker-loop.ts";
import {
  workerIsLive,
  writeWorkerHeartbeat,
} from "../../server/federation-worker-liveness.ts";
import { processNextFederationDelivery } from "../../server/federation-worker.mjs";
import { StorageError } from "../../server/storage/errors.ts";

test("idle federation cycle uses one domain RPC", async () => {
  let calls = 0;
  const store = {
    command(name: string) {
      calls++;
      assert.equal(name, "pollFederation");
      return { delivery: null, identity: null };
    },
  };
  assert.equal(
    await processNextFederationDelivery(store, {
      origin: "https://example.test",
    }),
    null,
  );
  assert.equal(calls, 1);
});

test("quota failures exponentially back off while liveness stays local", async () => {
  const controller = new AbortController();
  let calls = 0;
  let elapsed = 0;
  const starts: number[] = [];
  let heartbeats = 0;
  await runDeliveryLoop(
    async () => {
      starts.push(elapsed);
      calls++;
      if (calls === 5) controller.abort();
      throw new StorageError("storage_limit");
    },
    {
      signal: controller.signal,
      pollMs: 15000,
      onHeartbeat: () => {
        heartbeats++;
      },
      wait: async (ms) => {
        assert.ok(ms <= 15000);
        elapsed += ms;
      },
    },
  );
  assert.deepEqual(starts, [0, 15000, 45000, 105000, 225000]);
  assert.ok(heartbeats > calls);
});

test("worker liveness rejects stale, future and malformed heartbeat files", async () => {
  const root = await mkdtemp(join(tmpdir(), "kamelog-worker-health-"));
  const path = join(root, "heartbeat");
  try {
    assert.equal(workerIsLive(path, 100000), false);
    writeWorkerHeartbeat(path, 100000);
    assert.equal(workerIsLive(path, 100001), true);
    assert.equal(workerIsLive(path, 145000), false);
    assert.equal(workerIsLive(path, 99999), false);
    await writeFile(path, "invalid");
    assert.equal(workerIsLive(path), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
