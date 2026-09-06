import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(
  new URL("../../ops/kamelog-update", import.meta.url),
  "utf8",
);
const installer = await readFile(
  new URL("../../ops/install-host.sh", import.meta.url),
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

test("host installer preserves data and writes reproducible systemd overrides", () => {
  assert.match(installer, /test -r "\$ENV_FILE"/);
  assert.match(installer, /KAMELOG_APP_DIR=\$APP_DIR/);
  assert.match(installer, /KAMELOG_BACKUP_ROOT=\$BACKUP_ROOT/);
  assert.match(
    installer,
    /systemctl enable --now kamelog\.service kamelog-update\.timer/,
  );
  assert.doesNotMatch(installer, /down\s+(?:[^\n]*\s)?-v/);
});
