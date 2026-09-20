import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const updater = await readFile(
  new URL("../../ops/kamelog-update", import.meta.url),
  "utf8",
);
const compose = await readFile(
  new URL("../../compose.yaml", import.meta.url),
  "utf8",
);

test("host updater initializes the key before skipping an unchanged release", () => {
  const init = updater.indexOf("ensure_inference_encryption_key\n");
  const skip = updater.indexOf('if test "$current_sha" = "$remote_sha"');
  assert.ok(init >= 0 && skip > init);
  assert.match(
    compose,
    /KAMELOG_INFERENCE_ENCRYPTION_KEY: \$\{KAMELOG_INFERENCE_ENCRYPTION_KEY:-\}/,
  );
});

test("key initialization is idempotent and preserves the env file", () => {
  const start = updater.indexOf("ensure_inference_encryption_key() {");
  const end = updater.indexOf("\nensure_inference_encryption_key\n", start);
  assert.ok(start >= 0 && end > start);
  const temporary = mkdtempSync(join(tmpdir(), "kamelog-inference-key-"));
  const envFile = join(temporary, ".env");
  try {
    writeFileSync(envFile, "KAMELOG_ORIGIN=https://example.org\n", {
      mode: 0o600,
    });
    const shell = `set -Eeuo pipefail\nlog() { printf '%s\\n' "$*"; }\nfail() { printf 'failed\\n' >&2; exit 1; }\n${updater.slice(start, end)}\nensure_inference_encryption_key\nensure_inference_encryption_key\n`;
    const output = execFileSync("bash", ["-c", shell], {
      env: { ...process.env, ENV_FILE: envFile },
      encoding: "utf8",
    });
    const content = readFileSync(envFile, "utf8");
    const matches = [
      ...content.matchAll(/^KAMELOG_INFERENCE_ENCRYPTION_KEY=(.+)$/gm),
    ];
    assert.equal(matches.length, 1);
    assert.equal(Buffer.from(matches[0][1], "base64url").length, 32);
    assert.equal(statSync(envFile).mode & 0o777, 0o600);
    assert.doesNotMatch(output, new RegExp(matches[0][1]));
    assert.equal(output.trim().split("\n").length, 1);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
