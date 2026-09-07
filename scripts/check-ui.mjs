import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
// Approved CSS at the initial public snapshot. Backend changes may not redesign it.
assert.equal(
  createHash("sha256").update(readFileSync("app/globals.css")).digest("hex"),
  "28fa9b63cb1b45f9a5a8a4953627792f3529c647d59ece3b67b93671ccf5a6de",
  "Approved UI CSS changed. An explicit design decision is required.",
);
console.log("Approved CSS unchanged");
