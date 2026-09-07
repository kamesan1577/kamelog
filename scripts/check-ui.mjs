import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
// Approved CSS at the initial public snapshot. Backend changes may not redesign it.
assert.equal(
  createHash("sha256").update(readFileSync("app/globals.css")).digest("hex"),
  "69226b7b02bc9a1d75365443b0c7421d0c4e9c63d798ef356cbc484bc8e3499d",
  "Approved UI CSS changed. An explicit design decision is required.",
);
console.log("Approved CSS unchanged");
