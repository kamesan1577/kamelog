import assert from "node:assert/strict";
import test from "node:test";
import { isNewJavaScriptSource } from "../../scripts/typescript-policy.ts";

test("new first-party JavaScript is rejected across implementation and tests", () => {
  for (const path of [
    "app/page.js",
    "server/api.mjs",
    "scripts/migrate.cjs",
    "components/widget.jsx",
    "tests/server/example.test.mjs",
    "next.config.mjs",
  ]) {
    assert.equal(isNewJavaScriptSource(path), true, path);
  }
});

test("TypeScript and vendored upstream sources are accepted", () => {
  for (const path of [
    "app/page.tsx",
    "server/api.ts",
    "scripts/tool.mts",
    "tests/server/example.test.ts",
    "vendor/notion-ui/upstream.js",
    "vendor/example/index.mjs",
    "docs/design-system/readme.md",
  ]) {
    assert.equal(isNewJavaScriptSource(path), false, path);
  }
});
