import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/mobile-nav-layout.css", "utf8");

test("mobile bottom navigation uses three equal-width slots", () => {
  assert.match(
    css,
    /\.mobile-nav\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*justify-content:\s*initial;/s,
  );
  assert.match(
    css,
    /\.mobile-nav button\s*\{[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*height:\s*100%;[^}]*justify-content:\s*center;/s,
  );
});
