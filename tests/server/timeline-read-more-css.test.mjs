import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/landing.css", "utf8");

test("timeline blog cards advertise that more content is available", () => {
  assert.match(
    css,
    /\.post:has\(\.type-label\.blog\)\s+\.post-focus:not\(\.vlog-button\)::after\s*\{[^}]*content:\s*["']続きを読む →["'];/s,
  );
});
