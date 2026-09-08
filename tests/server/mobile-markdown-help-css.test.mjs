import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/mobile-blog-editor.css", "utf8");

test("mobile Markdown help scrolls the dialog itself", () => {
  assert.match(
    css,
    /\.markdown-help-dialog\s*\{[^}]*display:\s*flex;[^}]*max-height:\s*calc\(100dvh\s*-\s*16px\);[^}]*overflow-y:\s*auto;[^}]*touch-action:\s*pan-y;/s,
  );
  assert.match(
    css,
    /\.markdown-help-list\s*\{[^}]*flex:\s*0 0 auto;[^}]*overflow-y:\s*visible;/s,
  );
});
