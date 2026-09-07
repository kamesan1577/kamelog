import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

const read = (path) => readFile(`${root}/${path}`, "utf8");

test("X sharing uses the X brand mark instead of the close glyph", async () => {
  const [notebook, layout, styles, logo] = await Promise.all([
    read("app/notebook.tsx"),
    read("app/layout.tsx"),
    read("app/x-share-logo.css"),
    read("public/x-logo.svg"),
  ]);

  assert.match(
    notebook,
    /<div className="post-actions">[\s\S]*?<X size=\{16\} \/>[\s\S]*?Xで共有/,
  );
  assert.match(layout, /import "\.\/x-share-logo\.css";/);
  assert.match(styles, /button:has\(> \.lucide-x\)/);
  assert.match(styles, /mask: url\("\/x-logo\.svg"\)/);
  assert.match(logo, /viewBox="0 0 24 24"/);
  assert.match(logo, /M18\.244 2\.25h3\.308l-7\.227 8\.26/);
  assert.doesNotMatch(logo, /<(?:line|polyline)\b/);
});
