import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(
  "components/design-system/patterns/Landing.css",
  "utf8",
);

test("timeline blog cards advertise that more content is available", () => {
  assert.ok(
    css.includes(
      '[data-ds="post-card"][data-ds-kind="blog"] [data-ds="post-preview"]::after',
    ) && css.includes('content: "続きを読む →";'),
  );
});
