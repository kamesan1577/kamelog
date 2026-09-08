import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/page.tsx", "utf8");

test("public page exposes source and issue links for kamelog", () => {
  assert.match(page, /https:\/\/github\.com\/kamesan1577\/kamelog["']/);
  assert.match(
    page,
    /https:\/\/github\.com\/kamesan1577\/kamelog\/issues\/new["']/,
  );
  assert.match(page, /kamelog の開発情報/);
});
