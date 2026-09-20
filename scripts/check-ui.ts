import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const designSystem = path.join(root, "components", "design-system");
const allowlistPath = path.join(
  root,
  "docs",
  "design-system",
  "legacy-allowlist.json",
);
const parsed: unknown = JSON.parse(readFileSync(allowlistPath, "utf8"));
if (
  typeof parsed !== "object" ||
  parsed === null ||
  !("css" in parsed) ||
  !Array.isArray(parsed.css) ||
  !parsed.css.every((value: unknown) => typeof value === "string")
) {
  throw new TypeError("Invalid legacy CSS allowlist");
}
const allowlist: { css: string[] } = { css: parsed.css };

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
}

assert.equal(
  existsSync(designSystem),
  true,
  "Design System directory is required",
);
for (const file of files(designSystem).filter(
  (file) => /\.(tsx|ts)$/.test(file) && !file.endsWith(".stories.tsx"),
)) {
  const source = readFileSync(file, "utf8");
  assert.equal(
    /from ["']@\/app\//.test(source),
    false,
    `${path.relative(root, file)} imports a page layer`,
  );
  assert.equal(
    /from ["'](?:react-markdown|radix-ui|@base-ui)/.test(source),
    false,
    `${path.relative(root, file)} imports a third-party primitive directly`,
  );
  const story = file.replace(/\.(tsx|ts)$/, ".stories.tsx");
  assert.equal(
    existsSync(story),
    true,
    `${path.relative(root, file)} must have a colocated Storybook story`,
  );
}

const legacyFiles = files(path.join(root, "app")).filter((file) =>
  /\.css$/.test(file),
);
const newLegacy = legacyFiles
  .map((file) => path.relative(root, file))
  .filter((file) => !allowlist.css.includes(file));
assert.deepEqual(
  newLegacy,
  [],
  `Untracked legacy CSS files: ${newLegacy.join(", ")}`,
);
console.log(
  `UI semantic guardrails passed (${allowlist.css.length} legacy CSS files tracked)`,
);
