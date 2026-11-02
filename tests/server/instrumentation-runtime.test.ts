import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { webpack } = require("next/dist/compiled/webpack/webpack");

test("Edge instrumentation excludes the Node-only notification monitor at compile time", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kamelog-instrumentation-"));
  try {
    const source = await readFile(
      new URL("../../instrumentation.ts", import.meta.url),
      "utf8",
    );
    await mkdir(join(directory, "server"));
    await writeFile(join(directory, "instrumentation.ts"), source);
    // A representative Node-only dependency must never enter the Edge graph.
    await writeFile(
      join(directory, "server/notifications-process.mjs"),
      'import { spawn } from "node:child_process"; export function installProcessNotificationMonitor() { return spawn; }',
    );
    const compiler = webpack({
      mode: "development",
      target: "webworker",
      entry: join(directory, "instrumentation.ts"),
      output: { path: join(directory, "output"), filename: "edge.js" },
      plugins: [
        new webpack.DefinePlugin({
          "process.env.NEXT_RUNTIME": JSON.stringify("edge"),
        }),
      ],
    });
    try {
      await new Promise<void>((resolve, reject) => {
        compiler.run(
          (
            error: Error | null,
            stats: { hasErrors(): boolean; toString(): string },
          ) => {
            if (error) reject(error);
            else if (stats.hasErrors()) reject(new Error(stats.toString()));
            else resolve();
          },
        );
      });
      const bundle = await readFile(join(directory, "output/edge.js"), "utf8");
      assert.doesNotMatch(bundle, /node:child_process/);
      assert.doesNotMatch(bundle, /installProcessNotificationMonitor/);
    } finally {
      await new Promise<void>((resolve, reject) => {
        compiler.close((error: Error | null) =>
          error ? reject(error) : resolve(),
        );
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
