import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const directory = await mkdtemp(join(tmpdir(), "kamelog-e2e-"));
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      KAMELOG_DATA_DIR: directory,
      KAMELOG_ORIGIN: "http://localhost:3000",
      KAMELOG_BOOTSTRAP_TOKEN: "fictional-e2e-bootstrap-token-not-a-secret",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code || 0);
});
