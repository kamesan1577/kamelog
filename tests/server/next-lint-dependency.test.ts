import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import { z } from "zod";
import eslintConfig from "../../eslint.config.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const pluginRoot = dirname(
  require.resolve("@next/eslint-plugin-next/package.json"),
);
const pluginRequire = createRequire(join(pluginRoot, "package.json"));
const helperPath = "dist/utils/get-root-dirs.js";
const reviewedHelperSha =
  "886677432990a735e5ebdfb345ff1cbd40e264f9947a8432eeeb254b3a926bde";
// Captured from the full app/notebook.tsx rules/settings before the dependency
// replacement. This is deliberately independent of the installed Next config.
const originalNotebookConfigSha =
  "12c200dc4096ff7c01a5317b287fe3db69b62e3dfc849ea2381aea75e218d866";
const originalNextRules = {
  "@next/next/google-font-display": [1],
  "@next/next/google-font-preconnect": [1],
  "@next/next/next-script-for-ga": [1],
  "@next/next/no-async-client-component": [1],
  "@next/next/no-before-interactive-script-outside-document": [1],
  "@next/next/no-css-tags": [1],
  "@next/next/no-head-element": [1],
  "@next/next/no-html-link-for-pages": [2],
  "@next/next/no-img-element": [1],
  "@next/next/no-location-assign-relative-destination": [1],
  "@next/next/no-page-custom-font": [1],
  "@next/next/no-styled-jsx-in-document": [1],
  "@next/next/no-sync-scripts": [2],
  "@next/next/no-title-in-document-head": [1],
  "@next/next/no-typos": [1],
  "@next/next/no-unwanted-polyfillio": [1],
  "@next/next/inline-script-id": [2],
  "@next/next/no-assign-module-variable": [2],
  "@next/next/no-document-import-in-page": [2],
  "@next/next/no-duplicate-head": [2],
  "@next/next/no-head-import-in-document": [2],
  "@next/next/no-script-component-in-head": [2],
};

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([name, child]) => [name, canonical(child)]),
    );
  return value;
}

function sourceFiles(directory: string): string[] {
  const excluded = new Set([
    "node_modules",
    ".git",
    ".next",
    "out",
    "build",
    "coverage",
    "storybook-static",
    "playwright-report",
    "test-results",
    "vendor",
  ]);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return excluded.has(entry.name) ? [] : sourceFiles(path);
    return entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name)
      ? [path]
      : [];
  });
}

function assertDefaultRoot(settings: unknown, path: string) {
  if (
    settings === null ||
    typeof settings !== "object" ||
    !("next" in settings)
  )
    return;
  const next = settings.next;
  assert.ok(
    next === null ||
      (typeof next !== "object" && typeof next !== "function") ||
      !("rootDir" in next),
    `${path}: settings.next.rootDir is outside the reviewed single-root dependency replacement. Review glob compatibility before configuring custom Next roots.`,
  );
}

test("the Next glob replacement is scoped and pinned to the reviewed packages", () => {
  const manifest = z
    .object({
      devDependencies: z.record(z.string(), z.string()),
      overrides: z.record(
        z.string(),
        z.union([z.string(), z.record(z.string(), z.string())]),
      ),
    })
    .parse(json(join(root, "package.json")));
  assert.equal(manifest.devDependencies["eslint-config-next"], "16.3.8");
  assert.deepEqual(manifest.overrides["@next/eslint-plugin-next@16.3.8"], {
    "fast-glob": "npm:tinyglobby@0.2.17",
  });
  assert.equal(manifest.overrides["fast-glob"], undefined);
  const packageSchema = z.object({ name: z.string(), version: z.string() });
  assert.deepEqual(
    packageSchema.parse(json(join(pluginRoot, "package.json"))),
    {
      name: "@next/eslint-plugin-next",
      version: "16.3.8",
    },
  );
  assert.deepEqual(
    packageSchema.parse(json(pluginRequire.resolve("fast-glob/package.json"))),
    { name: "tinyglobby", version: "0.2.17" },
  );
  const replacement: unknown = pluginRequire("fast-glob");
  assert.ok(
    replacement !== null &&
      typeof replacement === "object" &&
      "globSync" in replacement &&
      typeof replacement.globSync === "function",
    "The aliased package must retain the helper's named globSync import",
  );
});

test("the installed plugin uses fast-glob only in the exact reviewed root helper", () => {
  const importers = sourceFiles(join(pluginRoot, "dist"))
    .filter((path) => readFileSync(path, "utf8").includes("fast-glob"))
    .map((path) => relative(pluginRoot, path));
  assert.deepEqual(importers, [helperPath]);
  assert.equal(
    hash(readFileSync(join(pluginRoot, helperPath), "utf8")),
    reviewedHelperSha,
    "Next's glob usage changed; review the dependency replacement before accepting it",
  );
});

test("all effective source configs retain Next rules and the default single root", async () => {
  const eslint = new ESLint({ cwd: root });
  let checked = 0;
  // Include all first-party source files, not merely one representative config:
  // a future files-specific rootDir override must fail this guard as well.
  for (const path of sourceFiles(root)) {
    const config = await eslint.calculateConfigForFile(path);
    if (!config) continue;
    const name = relative(root, path);
    assertDefaultRoot(config.settings, name);
    const nextRules = Object.fromEntries(
      Object.entries(config.rules ?? {}).filter(([rule]) =>
        rule.startsWith("@next/next/"),
      ),
    );
    assert.deepEqual(
      nextRules,
      {
        ...originalNextRules,
        ...(name === "app/notebook.tsx"
          ? { "@next/next/no-img-element": [0] }
          : {}),
      },
      `${name}: Next rule configuration must remain unchanged`,
    );
    checked += 1;
  }
  assert.ok(
    checked > 0,
    "The effective-config guard must inspect source files",
  );
});

for (const rootDir of [".", "apps/*", ["apps/site"], [], null, undefined]) {
  test(`the root guard rejects a newly configured rootDir: ${JSON.stringify(rootDir)}`, () => {
    assert.throws(
      () => assertDefaultRoot({ next: { rootDir } }, "future-config.tsx"),
      /settings\.next\.rootDir.*outside the reviewed single-root/,
    );
  });
}

test("the root guard rejects rootDir on callable or inherited Next settings", () => {
  for (const next of [
    Object.assign(() => undefined, { rootDir: "app" }),
    Object.setPrototypeOf(() => undefined, { rootDir: "app" }),
    Object.create({ rootDir: "app" }),
  ]) {
    assert.throws(
      () => assertDefaultRoot({ next }, "future-config.tsx"),
      /settings\.next\.rootDir.*outside the reviewed single-root/,
    );
  }
});

test("all notebook rules and settings match the pre-replacement baseline", async () => {
  const eslint = new ESLint({ cwd: root });
  const config = await eslint.calculateConfigForFile(
    join(root, "app/notebook.tsx"),
  );
  assert.ok(config);
  assert.equal(
    hash(
      JSON.stringify(
        canonical({ rules: config.rules, settings: config.settings }),
      ),
    ),
    originalNotebookConfigSha,
    "The dependency fix must not change the existing effective lint configuration",
  );
});

test("the reviewed helper preserves cwd when no custom rootDir is configured", () => {
  const helper: unknown = pluginRequire(join(pluginRoot, helperPath));
  assert.ok(
    helper !== null &&
      typeof helper === "object" &&
      "getRootDirs" in helper &&
      typeof helper.getRootDirs === "function",
  );
  for (const settings of [{}, { next: {} }]) {
    assertDefaultRoot(settings, "default-root-fixture.tsx");
    assert.deepEqual(helper.getRootDirs({ cwd: root, settings }), [root]);
  }
});

for (const router of ["pages", "src/pages", "app", "src/app"]) {
  test(`${router}: default-root lint still detects internal anchors and synchronous scripts`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "kamelog-next-lint-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await symlink(
      join(root, "node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    const route = router.endsWith("pages")
      ? join(directory, router, "fixture-destination.tsx")
      : join(directory, router, "page.tsx");
    await mkdir(dirname(route), { recursive: true });
    await writeFile(route, "export default function Page() { return null; }\n");
    const eslint = new ESLint({
      cwd: directory,
      overrideConfigFile: true,
      overrideConfig: eslintConfig,
    });
    const filePath = join(directory, "fixture.tsx");
    const config = await eslint.calculateConfigForFile(filePath);
    assert.ok(config);
    assertDefaultRoot(config.settings, filePath);

    // The upstream 16.3.8 App Router URL matcher supports this root route;
    // nested App Router matching has a pre-existing trailing-slash mismatch.
    const href = router.endsWith("pages") ? "/fixture-destination" : "/";
    const cases = [
      {
        name: "internal anchor",
        source: `export default function Fixture() { return <a href="${href}">Go</a>; }`,
        expected: ["@next/next/no-html-link-for-pages"],
      },
      {
        name: "next/link navigation",
        source: `import Link from "next/link"; export default function Fixture() { return <Link href="${href}">Go</Link>; }`,
        expected: [],
      },
      {
        name: "synchronous script",
        source:
          'export default function Fixture() { return <script src="https://example.com/fixture.js" />; }',
        expected: ["@next/next/no-sync-scripts"],
      },
      {
        name: "asynchronous script",
        source:
          'export default function Fixture() { return <script async src="https://example.com/fixture.js" />; }',
        expected: [],
      },
    ];
    for (const example of cases) {
      const results = await eslint.lintText(example.source, { filePath });
      assert.equal(results.length, 1, example.name);
      const result = results[0];
      assert.equal(result.fatalErrorCount, 0, example.name);
      assert.deepEqual(
        result.messages.map((message) => message.ruleId),
        example.expected,
        `${router}: ${example.name}`,
      );
      assert.ok(result.messages.every((message) => message.severity === 2));
    }
  });
}
