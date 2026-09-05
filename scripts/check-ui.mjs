import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
// Approved CSS at the initial public snapshot. Backend changes may not redesign it.
assert.equal(
  createHash("sha256").update(readFileSync("app/globals.css")).digest("hex"),
  "c86e64b44a297b70a38c4bda20f40e18789a2f02aff453d35e753746e1cf9611",
  "Approved UI CSS changed. An explicit design decision is required.",
);
console.log("Approved CSS unchanged");
