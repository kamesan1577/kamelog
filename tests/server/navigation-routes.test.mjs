import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalNavigationUrl,
  pathnameForView,
  viewFromPathname,
} from "../../lib/navigation.mjs";

test("main views have stable shareable paths", () => {
  assert.equal(pathnameForView("home"), "/");
  assert.equal(pathnameForView("timeline"), "/timeline");
  assert.equal(pathnameForView("projects"), "/projects");
  assert.equal(pathnameForView("account"), "/account");
  assert.equal(viewFromPathname("/timeline"), "timeline");
  assert.equal(viewFromPathname("/projects"), "projects");
  assert.equal(viewFromPathname("/account"), "account");
});

test("post detail remains on the existing root query URL", () => {
  assert.equal(
    canonicalNavigationUrl("https://kamesan.org/timeline?foo=1", {
      view: "home",
      post: "post-123",
      internal: true,
    }),
    "/?foo=1&post=post-123",
  );
});

test("view navigation removes the post query and changes pathname", () => {
  assert.equal(
    canonicalNavigationUrl("https://kamesan.org/?post=post-123", {
      view: "projects",
      post: null,
      internal: true,
    }),
    "/projects",
  );
});

test("projects route delegates to the existing main UI", async () => {
  const source = await readFile("app/projects/page.tsx", "utf8");
  assert.match(source, /import SitePage from "\.\.\/site-page"/);
  assert.match(source, /return <SitePage \/>/);
  assert.doesNotMatch(source, /engineering-works/);
  assert.doesNotMatch(source, /public-profile/);
});
