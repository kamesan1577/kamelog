import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("deployment backs up online before rolling the two app replicas", () => {
  const backup = script.indexOf("\nbackup_online\n");
  const checkout = script.indexOf(
    'git checkout --quiet --detach "$remote_sha"',
  );
  const build = script.indexOf('"${compose[@]}" build app-blue', checkout);
  const blue = script.indexOf("deploy_replica app-blue", build);
  const green = script.indexOf("deploy_replica app-green", blue);
  const worker = script.indexOf(
    '"${compose[@]}" up -d --no-deps federation-worker',
    green,
  );
  assert.ok(
    backup >= 0 &&
      checkout > backup &&
      build > checkout &&
      blue > build &&
      green > blue &&
      worker > green,
  );
  assert.doesNotMatch(script, /stop app/);
  assert.doesNotMatch(script, /down\s+(?:[^\n]*\s)?-v/);
});

test("backup CLI is selected from the running image, regardless of TS migration", async () => {
  const match = script.match(/app-blue sh -eu -c '([\s\S]*?)' backup "\/backups\/\$backup_name"/);
  assert.ok(match, "backup command must execute in the pre-upgrade image");
  const backupCommand = match[1];
  for (const extension of ["mjs", "ts"]) {
    const directory = await mkdtemp(join(tmpdir(), "kamelog-deploy-backup-"));
    try {
      await mkdir(join(directory, "scripts"));
      await writeFile(
        join(directory, "scripts", `admin.${extension}`),
        'require("node:fs").writeFileSync(process.env.BACKUP_MARKER, process.argv.slice(2).join("|"));',
      );
      const marker = join(directory, "backup-marker");
      const result = spawnSync(
        "sh",
        ["-eu", "-c", backupCommand, "backup", "/backups/fixture"],
        {
          cwd: directory,
          env: { ...process.env, BACKUP_MARKER: marker },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(await readFile(marker, "utf8"), "backup|/data|/backups/fixture");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("missing backup CLI fails closed before replacing any release", () => {
  assert.match(script, /no supported backup CLI in the running image/);
  assert.match(script, /deployment_started=0/);
  assert.match(script, /if test "\$deployment_started" != 1/);
  assert.match(script, /deployment_started=1\nlog "deploying/);
});

test("rollback restores old checkout and Compose manifest before old image and containers", () => {
  const rollback = script.slice(
    script.indexOf("restore_previous_release() {"),
    script.indexOf("\ntrap restore_previous_release ERR"),
  );
  const checkout = rollback.indexOf('git checkout --quiet --detach "$current_sha"');
  const tag = rollback.indexOf(
    'docker image tag "$previous_image" kamelog-app:current',
  );
  const blue = rollback.indexOf("deploy_replica app-blue");
  const green = rollback.indexOf("deploy_replica app-green");
  const worker = rollback.indexOf('"${compose[@]}" up -d --no-deps federation-worker');
  assert.ok(checkout >= 0 && tag > checkout && blue > tag);
  assert.ok(green > blue && worker > green);
  assert.match(rollback, /healthcheck_worker \|\| rollback_ok=0/);
  assert.match(rollback, /rollback verified/);
  assert.match(rollback, /rollback incomplete/);
  assert.match(script, /docker image tag "\$previous_image" kamelog-app:rollback/);
});

test("worker health reads Docker health status rather than calling the next release CLI", () => {
  const workerHealth = script.slice(
    script.indexOf("healthcheck_worker() {"),
    script.indexOf("\ndeploy_replica() {"),
  );
  assert.match(workerHealth, /docker inspect --format/);
  assert.doesNotMatch(workerHealth, /federation-worker-health\.(?:ts|mjs)/);
});

test("deployment preserves free space without pruning volumes or the rollback image", () => {
  assert.match(script, /MIN_FREE_KIB/);
  assert.match(script, /builder prune --all --force --keep-storage 8GB/);
  assert.match(script, /previous_rollback_image/);
  assert.match(script, /docker image rm "\$previous_rollback_image"/);
  assert.doesNotMatch(script, /docker image prune/);
  assert.doesNotMatch(script, /docker system prune/);
  assert.doesNotMatch(script, /--volumes/);
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
  assert.match(compose, /federation-worker:/);
  assert.match(compose, /scripts\/federation-worker-health\.ts/);
  assert.match(compose, /127\.0\.0\.1:3000:3000/);
  assert.match(gateway, /server app-blue:3000 resolve/);
  assert.match(gateway, /server app-green:3000 resolve/);
  assert.match(gateway, /proxy_next_upstream/);
});

test("host installer preserves data and writes reproducible systemd overrides", () => {
  assert.match(installer, /test -r "\$ENV_FILE"/);
  assert.match(installer, /ensure_inference_encryption_key/);
  assert.match(installer, /openssl rand -base64 32/);
  assert.match(installer, /KAMELOG_INFERENCE_ENCRYPTION_KEY/);
  assert.match(installer, /chown --reference="\$ENV_FILE"/);
  assert.match(installer, /KAMELOG_APP_DIR=\$APP_DIR/);
  assert.match(installer, /KAMELOG_BACKUP_ROOT=\$BACKUP_ROOT/);
  assert.match(
    installer,
    /systemctl enable --now kamelog\.service kamelog-update\.timer/,
  );
  assert.doesNotMatch(installer, /down\s+(?:[^\n]*\s)?-v/);
});
