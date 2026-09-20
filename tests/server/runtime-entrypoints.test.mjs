import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");

for (const service of ["kamelog-auto-tag", "kamelog-auto-thread"]) {
  test(`${service} entrypoint is copied into the runtime image`, () => {
    const unit = readFileSync(
      new URL(`../../ops/systemd/${service}.service`, import.meta.url),
      "utf8",
    );
    const entrypoint = unit.match(/node (scripts\/[\w-]+\.mjs)/)?.[1];
    assert.ok(entrypoint, `${service} must declare a Node entrypoint`);
    assert.ok(
      dockerfile.split("\n").some(
        (line) =>
          line.startsWith("COPY --from=build ") &&
          line.endsWith(`/app/${entrypoint} ./${entrypoint}`),
      ),
      `${entrypoint} is missing from the runtime image`,
    );
  });
}
