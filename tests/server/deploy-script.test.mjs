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
test("deployment backs up online and rolls the two app replicas one at a time", () => {
  const backup = script.indexOf("scripts/admin.mjs backup");
  const checkout = script.indexOf(
    'git checkout --quiet --detach "$remote_sha"',
  );
  const build = script.indexOf('"${compose[@]}" build app-blue', checkout);
  const blue = script.indexOf("deploy_replica app-blue", build);
  const green = script.indexOf("deploy_replica app-green", blue);
  assert.ok(
    backup >= 0 &&
      checkout > backup &&
      build > checkout &&
      blue > build &&
      green > blue,
  );
  assert.doesNotMatch(script, /stop app/);
  assert.doesNotMatch(script, /down\s+(?:[^\n]*\s)?-v/);
});
test("deployment health checks, disk space and attempts a code rollback", () => {
  assert.match(script, /curl --fail --silent --show-error "\$HEALTH_URL"/);
  assert.match(script, /healthcheck_replica/);
  assert.match(
    script,
    /docker image tag "\$previous_image" kamelog-app:current/,
  );
  assert.match(script, /MIN_FREE_KIB/);
  assert.match(script, /git checkout --quiet --detach "\$current_sha"/);
  assert.match(script, /backup retained/);
});
test("compose keeps a gateway in front of two application replicas", async () => {
  const compose = await readFile(
    new URL("../../compose.yaml", import.meta.url),
    "utf8",
  );
  const gateway = await readFile(
    new URL("../../ops/nginx.conf", import.meta.url),
    "utf8",
  );
  assert.match(compose, /gateway:/);
  assert.match(compose, /app-blue:/);
  assert.match(compose, /app-green:/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(gateway, /server app-blue:3000 resolve/);
  assert.match(gateway, /server app-green:3000 resolve/);
  assert.match(gateway, /proxy_next_upstream/);
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
