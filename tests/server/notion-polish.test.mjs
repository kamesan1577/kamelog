import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync("app/landing.css", "utf8");
const variants = readFileSync("components/notion/variants.ts", "utf8");

test("keeps the landing polish restrained and stateful", () => {
  assert.match(landing, /--landing-hover:\s*#f7f7f5/);
  assert.match(landing, /\.landing-actions button:active/);
  assert.match(landing, /\.content-cards > button:active/);
  assert.match(landing, /\.featured-post:active/);
  assert.doesNotMatch(landing, /@keyframes/);
});

test("gives shared buttons visible hover, active and focus states", () => {
  assert.match(variants, /transition-colors duration-75/);
  assert.match(variants, /focus-visible:outline-\[#2383e2\]/);
  assert.match(variants, /hover:bg-\[#f7f7f5\]/);
  assert.match(variants, /active:bg-\[#efefed\]/);
});
