import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";

const heartbeatSchema = z
  .object({ pid: z.number().int().positive(), at: z.number().finite() })
  .strict();
export function heartbeatPath() {
  return (
    process.env.KAMELOG_WORKER_HEARTBEAT_PATH ||
    "/tmp/kamelog-federation-heartbeat.json"
  );
}
export function writeWorkerHeartbeat(path = heartbeatPath(), now = Date.now()) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ pid: process.pid, at: now }), {
    mode: 0o600,
  });
  renameSync(temporary, path);
}
export function workerIsLive(path = heartbeatPath(), now = Date.now()) {
  try {
    const value = heartbeatSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    if (now - value.at >= 45_000 || now < value.at) return false;
    process.kill(value.pid, 0);
    return true;
  } catch {
    return false;
  }
}
