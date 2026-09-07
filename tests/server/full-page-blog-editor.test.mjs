import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("app/notebook.tsx", "utf8");
const css = readFileSync("app/full-page-blog-editor.css", "utf8");

test("blog editor keeps modal mode and offers full-page live split preview", () => {
  assert.match(source, /"フルページで編集"/);
  assert.match(source, /aria-label="エディタ表示"/);
  assert.match(
    source,
    /setBlogEditorMode\("split"\);\s*setFullPageEditor\(true\)/s,
  );
  assert.match(
    source,
    /<Markdown text=\{"# " \+ title \+ "\\n\\n" \+ body\} \/>/,
  );
  assert.match(
    css,
    /\.blog-dialog\.is-full-page\s*\{[^}]*width:\s*100vw[^}]*height:\s*100dvh/s,
  );
  assert.match(
    css,
    /\.blog-editor-workspace\.mode-split\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/s,
  );
});
