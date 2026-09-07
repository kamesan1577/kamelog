import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../../app/detail-actions.css", import.meta.url);
const layoutUrl = new URL("../../app/layout.tsx", import.meta.url);

test("keeps blog detail actions visible while reading", async () => {
  const [css, layout] = await Promise.all([
    readFile(cssUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
  ]);

  assert.match(layout, /import "\.\/detail-actions\.css";/);
  assert.match(
    css,
    /@media \(min-width: 1000px\)[\s\S]*\.detail-page:has\(> \.markdown\) > \.post-actions\s*\{[^}]*position:\s*sticky;[^}]*top:\s*76px;/,
  );
  assert.match(
    css,
    /grid-template-columns:\s*46px minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /@media \(max-width: 999px\)[\s\S]*\.detail-page:has\(> \.markdown\) > \.post-actions\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*18px;/,
  );
  assert.match(
    css,
    /@media \(max-width: 640px\)[\s\S]*bottom:\s*calc\(77px \+ env\(safe-area-inset-bottom, 0px\)\);/,
  );
});
