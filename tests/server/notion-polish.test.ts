import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const landing = readFileSync(
  "components/design-system/patterns/Landing.css",
  "utf8",
);
const theme = readFileSync("styles/brand-theme.css", "utf8");
const variants = readFileSync("components/notion/variants.ts", "utf8");
const tokens = readFileSync("styles/tokens.css", "utf8");

test("keeps the social profile restrained and stateful", () => {
  assert.match(landing, /--landing-hover:\s*var\(--ds-color-bg-hover\)/);
  assert.match(landing, /\.landing-actions button:active/);
  assert.match(landing, /\.content-cards > button:active/);
  assert.match(landing, /\.featured-post:active/);
  assert.match(landing, /background:\s*var\(--ds-color-accent\)/);
  assert.doesNotMatch(landing, /border-left:/);
  assert.doesNotMatch(landing, /@keyframes/);
});

test("gives shared buttons visible hover, active and focus states", () => {
  assert.match(variants, /transition-colors duration-75/);
  assert.match(variants, /focus-visible:outline-ds-accent/);
  assert.match(variants, /hover:bg-ds-hover/);
  assert.match(variants, /active:bg-ds-active/);
  assert.match(
    variants,
    /solid:\s*"[^"]*bg-ds-action text-ds-action-foreground/,
  );
  assert.doesNotMatch(variants, /bg-\[#2383e2\]/);
});

test("pairs theme-aware ink with the social feed surface", () => {
  assert.match(theme, /--kamelog-ink:\s*var\(--ds-color-text-primary\)/);
  assert.match(theme, /--kamelog-paper:\s*var\(--ds-color-bg-page\)/);
  assert.match(tokens, /--ds-color-text-primary:\s*light-dark\(#37352f,/);
  assert.match(tokens, /--ds-color-bg-page:\s*light-dark\(#f8f9f6,/);
  assert.match(theme, /\[data-ds="public-sidebar"\] button\.active/);
  assert.match(theme, /\[data-ds="content-grid"\]:not\(\.landing-layout\)/);
  assert.doesNotMatch(theme, /#2383e2|#277dae|#337ea9/);
});
