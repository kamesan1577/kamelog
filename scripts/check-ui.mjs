import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
// Approved CSS at the initial public snapshot. Backend changes may not redesign it.
assert.equal(
  createHash("sha256").update(readFileSync("app/globals.css")).digest("hex"),
  "75d931564f332c39049336d1f02993db1861016763876147a2bd77e1c1771a26",
  "Approved UI CSS changed. An explicit design decision is required.",
);
console.log("Approved CSS unchanged");
