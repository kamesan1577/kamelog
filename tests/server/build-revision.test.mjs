import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildRevision } from "../../lib/build-revision.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const url = `https://github.com/kamesan1577/kamelog/commit/${sha}`;

test("links a valid build SHA to its exact commit", () => {
  const revision = buildRevision(sha);
  assert.equal(revision?.sha, sha);
  assert.equal(revision?.shortSha, "0123456");
  assert.equal(revision?.url, url);
});

test("normalizes uppercase SHA", () => {
  assert.equal(buildRevision(sha.toUpperCase())?.sha, sha);
});

test("rejects invalid build metadata", () => {
  assert.equal(buildRevision(undefined), null);
  assert.equal(buildRevision(null), null);
  assert.equal(buildRevision("main"), null);
  assert.equal(buildRevision("abc1234"), null);
  assert.equal(buildRevision("g".repeat(40)), null);
});

test("the footer reads the image revision", async () => {
  const path = new URL("../../app/site-page.tsx", import.meta.url);
  const source = await readFile(path, "utf8");
  assert.ok(source.includes("buildRevision(process.env.KAMELOG_BUILD_SHA)"));
  assert.ok(source.includes("href={revision.url}"));
});

test("deployment stamps the exact image revision", async () => {
  const path = new URL("../../ops/kamelog-update", import.meta.url);
  const source = await readFile(path, "utf8");
  assert.ok(source.includes('KAMELOG_BUILD_SHA="$remote_sha"'));
});

test("Docker builds preserve the image revision", async () => {
  const path = new URL("../../Dockerfile", import.meta.url);
  const source = await readFile(path, "utf8");
  assert.ok(source.includes("KAMELOG_BUILD_SHA=${KAMELOG_BUILD_SHA}"));
});
