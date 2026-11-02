import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("restores the Issue 240 composer visual contracts", async () => {
  const [composer, editor] = await Promise.all([
    read("components/design-system/patterns/ComposerLayout.css"),
    read("components/design-system/patterns/EditorDialog.css"),
  ]);

  assert.match(
    composer,
    /\.desktop-composer \.image-upload-button input\s*\{[^}]*display:\s*none;/,
  );
  assert.match(
    composer,
    /\.desktop-composer \.composer-start > \[data-slot="button"\]:disabled\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--ds-color-action\) 40%, transparent\);[^}]*color:\s*var\(--ds-color-action-foreground\);[^}]*opacity:\s*1;/,
  );
  for (const tabs of ["editor-kinds", "vlog-tabs"]) {
    assert.match(
      editor,
      new RegExp(
        `\\.${tabs}\\s+\\[data-slot="tabs-trigger"\\]\\[data-state="active"\\][^{]*\\{[^}]*background:\\s*var\\(--ds-color-action\\);[^}]*color:\\s*var\\(--ds-color-action-foreground\\);`,
        "s",
      ),
    );
  }
});

test("stops a vlog stream that resolves after the composer was closed", async () => {
  const source = await read("app/notebook.tsx");

  assert.ok(source.includes("const cameraRequest = useRef(0);"));
  assert.ok(source.includes("const requestId = ++cameraRequest.current;"));
  assert.ok(
    source.includes("nextStream.getTracks().forEach((track) => track.stop());"),
  );
});

test("keeps thread cards readable instead of collapsing the tree", async () => {
  const css = await read(
    "components/design-system/patterns/TweetThreadDetail.module.css",
  );

  assert.ok(css.includes("gap: 12px") && css.includes("padding-top: 24px"));
  assert.ok(
    css.includes(".composer .image-upload-button input") &&
      css.includes("display: none"),
  );
});
