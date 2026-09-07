import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../../app/detail-actions.css", import.meta.url);
const layoutUrl = new URL("../../app/layout.tsx", import.meta.url);

test("keeps blog detail actions ahead of article content", async () => {
  const [css, layout] = await Promise.all([
    readFile(cssUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
  ]);

  assert.match(layout, /import "\.\/detail-actions\.css";/);
  assert.match(
    css,
    /\.detail-page:has\(> \.markdown\)\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
  );
  assert.match(
    css,
    /\.detail-page:has\(> \.markdown\) > \*\s*\{[^}]*order:\s*3;/s,
  );
  assert.match(
    css,
    /\.detail-page:has\(> \.markdown\) > \.back-button\s*\{[^}]*order:\s*0;/s,
  );
  assert.match(
    css,
    /\.detail-page:has\(> \.markdown\) > \.post-meta\s*\{[^}]*order:\s*1;/s,
  );
  assert.match(
    css,
    /\.detail-page:has\(> \.markdown\) > \.post-actions\s*\{[^}]*order:\s*2;[^}]*border-top:\s*0;[^}]*border-bottom:/s,
  );
});
