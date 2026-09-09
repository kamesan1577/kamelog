import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync("app/landing.css", "utf8");
const theme = readFileSync("app/brand-theme.css", "utf8");
const variants = readFileSync("components/notion/variants.ts", "utf8");

test("keeps the landing polish restrained and stateful", () => {
  assert.match(landing, /--landing-hover:\s*#f7f7f5/);
  assert.match(landing, /\.landing-actions button:active/);
  assert.match(landing, /\.content-cards > button:active/);
  assert.match(landing, /\.featured-post:active/);
  assert.match(landing, /background:\s*var\(--landing-ink\)/);
  assert.doesNotMatch(landing, /border-left:/);
  assert.doesNotMatch(landing, /@keyframes/);
});

test("gives shared buttons visible hover, active and focus states", () => {
  assert.match(variants, /transition-colors duration-75/);
  assert.match(variants, /focus-visible:outline-\[#37352f\]/);
  assert.match(variants, /hover:bg-\[#f7f7f5\]/);
  assert.match(variants, /active:bg-\[#efefed\]/);
  assert.match(variants, /solid:[\s\S]*bg-\[#37352f\]/);
  assert.doesNotMatch(variants, /bg-\[#2383e2\]/);
});

test("uses the original ink color across the site theme", () => {
  assert.match(theme, /--kamelog-ink:\s*#37352f/);
  assert.match(theme, /--kamelog-paper:\s*#f6f5f4/);
  assert.match(theme, /\.public-sidebar button\.active/);
  assert.match(theme, /\.content-grid:not\(\.landing-layout\)/);
  assert.doesNotMatch(theme, /#2383e2|#277dae|#337ea9/);
});
