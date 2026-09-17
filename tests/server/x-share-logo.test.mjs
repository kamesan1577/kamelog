import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

const read = (path) => readFile(`${root}/${path}`, "utf8");

test("X sharing uses the X brand mark instead of the close glyph", async () => {
  const [notebook, postActions, layout, icon, styles, logo] = await Promise.all(
    [
      read("app/notebook.tsx"),
      read("components/design-system/patterns/PostActions.tsx"),
      read("app/layout.tsx"),
      read("components/design-system/primitives/XShareIcon.tsx"),
      read("components/design-system/primitives/XShareIcon.module.css"),
      read("public/x-logo.svg"),
    ],
  );

  assert.match(notebook, /<PostActions className="post-actions">/);
  assert.match(notebook, /<XShareIcon \/>[\s\S]*?Xで共有/);
  assert.match(postActions, /data-ds="post-actions"/);
  assert.doesNotMatch(layout, /x-share-logo\.css/);
  assert.match(icon, /data-ds="x-share-icon"/);
  assert.match(styles, /mask: url\("\/x-logo\.svg"\)/);
  assert.match(logo, /viewBox="0 0 24 24"/);
  assert.match(logo, /M18\.244 2\.25h3\.308l-7\.227 8\.26/);
  assert.doesNotMatch(logo, /<(?:line|polyline)\b/);
});
