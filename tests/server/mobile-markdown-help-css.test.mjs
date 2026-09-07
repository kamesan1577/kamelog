import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/mobile-blog-editor.css", "utf8");

test("mobile Markdown help keeps a constrained touch-scroll container", () => {
  assert.match(
    css,
    /\.markdown-help-dialog\s*\{[^}]*display:\s*flex;[^}]*height:\s*92dvh;[^}]*overflow:\s*hidden;/s,
  );
  assert.match(
    css,
    /\.markdown-help-list\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/s,
  );
});
