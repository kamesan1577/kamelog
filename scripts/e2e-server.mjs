import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
const port = process.env.KAMELOG_E2E_PORT || "3000";
const directory = await mkdtemp(join(tmpdir(), "kamelog-e2e-"));
await cp(".next/static", ".next/standalone/.next/static", {
  recursive: true,
});
await cp("public", ".next/standalone/public", { recursive: true });
const child = spawn(process.execPath, ["server.js"], {
  cwd: ".next/standalone",
  stdio: "inherit",
  env: {
    ...process.env,
    KAMELOG_DATA_DIR: directory,
    KAMELOG_ORIGIN: `http://localhost:${port}`,
    KAMELOG_BOOTSTRAP_TOKEN: "fictional-e2e-bootstrap-token-not-a-secret",
    HOSTNAME: "127.0.0.1",
    PORT: port,
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code || 0);
});
