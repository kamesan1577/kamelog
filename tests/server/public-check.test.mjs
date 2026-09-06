import test from "node:test";
import assert from "node:assert/strict";
import {
  forbiddenPath,
  containsSensitiveText,
  isAllowedEmail,
} from "../../scripts/check-public-repo.mjs";

test("public repository gate catches negative fixtures", () => {
  assert.match(".runtime/kamelog.sqlite", forbiddenPath);
  assert.match("backups/day-one/manifest.json", forbiddenPath);
  assert.equal(containsSensitiveText("gh" + "p_" + "a".repeat(30), []), true);
  assert.equal(
    containsSensitiveText("fictional private marker", ["private marker"]),
    true,
  );
  assert.equal(containsSensitiveText("safe fixture", []), false);
  assert.equal(isAllowedEmail("kamesan1577@gmail.com"), true);
  assert.equal(isAllowedEmail("matsugaura_ken@andfactory.co.jp"), true);
  assert.equal(
    isAllowedEmail("41898282+github-actions[bot]@users.noreply.github.com"),
    true,
  );
  assert.equal(isAllowedEmail("developer@example.test"), false);
});
