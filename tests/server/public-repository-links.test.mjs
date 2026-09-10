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

test("public page exposes the Shiryu mutual link in the source footer", () => {
  assert.match(page, /site-mutual-links/);
  assert.match(page, /aria-labelledby="mutual-links-title"/);
  assert.match(page, /https:\/\/shiryu\.win\//);
  assert.match(page, /className="shiryu-banner"/);
});
