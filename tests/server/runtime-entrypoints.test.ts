import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dockerfilePath = new URL("../../Dockerfile", import.meta.url);
const dockerfile = readFileSync(dockerfilePath, "utf8");

for (const service of ["kamelog-auto-tag", "kamelog-auto-thread"]) {
  test(`${service} entrypoint is copied into the runtime image`, () => {
    const unit = readFileSync(
      new URL(`../../ops/systemd/${service}.service`, import.meta.url),
      "utf8",
    );
    const entrypoint = unit.match(/node (scripts\/[\w-]+\.ts)/)?.[1];
    assert.ok(entrypoint, `${service} must declare a Node entrypoint`);
    const expectedCopy = `COPY --from=build --chown=node:node /app/${entrypoint} ./${entrypoint}`;
    assert.ok(
      dockerfile.includes(expectedCopy),
      `${entrypoint} is missing from the runtime image`,
    );
  });
}
