import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
// Approved CSS at the initial public snapshot. Backend changes may not redesign it.
assert.equal(
  createHash("sha256").update(readFileSync("app/globals.css")).digest("hex"),
  "3a723aeb509d151b9fba24ad3acbd220b50982020955f6549a31260ac153174d",
  "Approved UI CSS changed. An explicit design decision is required.",
);
console.log("Approved CSS unchanged");
