import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("restores the Issue 240 composer visual contracts", async () => {
  const [composer, editor] = await Promise.all([
    read("components/design-system/patterns/ComposerLayout.css"),
    read("components/design-system/patterns/EditorDialog.css"),
  ]);

  assert.ok(
    composer.includes(".desktop-composer .image-upload-button input") &&
      composer.includes("display: none"),
  );
  assert.ok(
    composer.includes(":disabled") &&
      composer.includes("background: #37352f66") &&
      composer.includes("color: #fff"),
  );
  assert.ok(
    editor.includes(".editor-kinds") &&
      editor.includes('data-state="active"') &&
      editor.includes("background: #37352f"),
  );
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
