import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRevision } from "../../lib/build-revision.mjs";

const sha = "a".repeat(40);

test("a validated build SHA links to its exact GitHub commit", () => {
  assert.deepEqual(buildRevision(sha), {
    sha,
    shortSha: "aaaaaaa",
    url: `https://github.com/kamesan1577/kamelog/commit/${sha}`,
  });
  assert.equal(buildRevision(sha.toUpperCase())?.sha, sha);
});

test("missing or invalid build metadata never generates a misleading link", () => {
  for (const value of [
    undefined,
    null,
    "",
    "main",
    "unknown",
    "a".repeat(7),
    `${sha}/../../evil`,
    "g".repeat(40),
  ]) {
    assert.equal(buildRevision(value), null);
  }
});

test("the footer uses the running image revision instead of remote HEAD", async () => {
  const page = await readFile(
    new URL("../../app/site-page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /buildRevision\(process\.env\.KAMELOG_BUILD_SHA\)/);
  assert.match(page, /\{revision && \(/);
  assert.match(page, /href=\{revision\.url\}/);
  assert.match(page, /\{revision\.shortSha\}/);
});

test("the CI-approved SHA is stored in the image for both build and runtime", async () => {
  const [dockerfile, compose, deploy] = await Promise.all([
    readFile(new URL("../../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../../compose.yaml", import.meta.url), "utf8"),
    readFile(new URL("../../ops/kamelog-update", import.meta.url), "utf8"),
  ]);
  assert.equal((dockerfile.match(/^ARG KAMELOG_BUILD_SHA$/gm) ?? []).length, 2);
  assert.equal(
    (dockerfile.match(/KAMELOG_BUILD_SHA=\$\{KAMELOG_BUILD_SHA\}/g) ?? []).length,
    2,
  );
  assert.match(compose, /KAMELOG_BUILD_SHA: \$\{KAMELOG_BUILD_SHA:-\}/);
  assert.match(
    deploy,
    /KAMELOG_BUILD_SHA="\$remote_sha" "\$\{compose\[@\]\}" build app-blue/,
  );
  assert.match(
    deploy,
    /docker image tag "\$previous_image" kamelog-app:current/,
  );
});
