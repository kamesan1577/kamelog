import test from "node:test";
import assert from "node:assert/strict";
import { apiErrorMessage, networkErrorMessage } from "../../lib/api-error.mjs";

test("API failures explain an actionable next step", () => {
  assert.match(apiErrorMessage(400, "Invalid input"), /入力内容/);
  assert.match(apiErrorMessage(401, "Unauthorized"), /ログイン/);
  assert.match(apiErrorMessage(403, "Origin rejected"), /開き直/);
  assert.match(apiErrorMessage(404, "Not found"), /見つかりません/);
  assert.match(apiErrorMessage(409, "Conflict"), /再読み込み/);
  assert.match(apiErrorMessage(413, "Payload too large"), /サイズ/);
  assert.match(apiErrorMessage(429, "Try later"), /再試行/);
  assert.match(apiErrorMessage(503, "internal private exception"), /再試行/);
  assert.doesNotMatch(apiErrorMessage(503, "internal private exception"), /private/);
  assert.match(networkErrorMessage, /接続を確認/);
});

test("specific, server-approved Japanese validation and conflict messages survive", () => {
  assert.equal(
    apiErrorMessage(400, "Fediverseアドレスを確認してください。"),
    "Fediverseアドレスを確認してください。",
  );
  assert.equal(
    apiErrorMessage(409, "別の操作で変更されました。再読み込みしてください。"),
    "別の操作で変更されました。再読み込みしてください。",
  );
});
