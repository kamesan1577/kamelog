import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(
  new URL("../../ops/kamelog-update", import.meta.url),
  "utf8",
);

test("deployment is serialized and restricted to a successful main CI commit", () => {
  assert.match(script, /flock -n/);
  assert.match(script, /status=success/);
  assert.match(script, /remote_sha" != "\$ci_sha/);
});

test("deployment takes a stopped backup before changing revisions", () => {
  const stop = script.indexOf('"${compose[@]}" stop app');
  const backup = script.indexOf("scripts/admin.mjs backup");
  const checkout = script.indexOf(
    'git checkout --quiet --detach "$remote_sha"',
  );

  assert.ok(stop >= 0 && backup > stop && checkout > backup);
  assert.doesNotMatch(script, /down\s+(?:[^\n]*\s)?-v/);
});

test("deployment health checks and attempts a code rollback", () => {
  assert.match(script, /curl --fail --silent --show-error "\$HEALTH_URL"/);
  assert.match(script, /git checkout --quiet --detach "\$current_sha"/);
  assert.match(script, /backup retained/);
});
