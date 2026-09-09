import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cssUrl = new URL("../../app/composer-layout.css", import.meta.url);
const layoutUrl = new URL("../../app/layout.tsx", import.meta.url);

test("keeps the inline image attachment separate from post-type actions", async () => {
  const [css, layout] = await Promise.all([
    readFile(cssUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
  ]);

  assert.match(layout, /import "\.\/composer-layout\.css";/);
  assert.match(
    css,
    /\.desktop-composer \.composer-kinds\s*\{[^}]*display:\s*grid;/s,
  );
  assert.match(
    css,
    /\.desktop-composer \.composer-kinds > \.image-upload-button\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*border-bottom:/s,
  );
});

test("keeps the inline publish button compact when disabled", async () => {
  const css = await readFile(cssUrl, "utf8");

  assert.match(
    css,
    /\.desktop-composer \.composer-start > \[data-slot="button"\]\s*\{[^}]*flex:\s*0\s+0\s+auto;[^}]*text-align:\s*center;[^}]*color:\s*#fff;/s,
  );
});
