import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canonicalNavigationUrl,
  pathnameForView,
  readerModeFromSearch,
  viewFromPathname,
} from "../../lib/navigation.ts";

test("public main views have stable shareable paths", () => {
  assert.equal(pathnameForView("home"), "/");
  assert.equal(pathnameForView("timeline"), "/timeline");
  assert.equal(pathnameForView("projects"), "/projects");
  assert.equal(viewFromPathname("/timeline"), "timeline");
  assert.equal(viewFromPathname("/projects"), "projects");
  assert.equal(viewFromPathname("/account"), null);
});

test("post detail remains on the existing root query URL", () => {
  assert.equal(
    canonicalNavigationUrl("https://kamesan.org/timeline?foo=1", {
      view: "home",
      post: "post-123",
    }),
    "/?foo=1&post=post-123",
  );
});

test("view navigation removes the post query and changes pathname", () => {
  assert.equal(
    canonicalNavigationUrl("https://kamesan.org/?post=post-123", {
      view: "projects",
      post: null,
    }),
    "/projects",
  );
});

test("leaving an article removes its presentation mode and preserves unrelated URL state", () => {
  assert.equal(
    canonicalNavigationUrl(
      "https://kamesan.org/?post=post-123&reader=page&source=feed#section",
      {
        view: "projects",
        post: null,
        readerMode: "page",
      },
    ),
    "/projects?source=feed#section",
  );
});

test("page mode requires an explicit supported URL preference and a post", () => {
  assert.equal(readerModeFromSearch("?post=example&reader=page"), "page");
  for (const search of [
    "",
    "?reader=page",
    "?post=&reader=page",
    "?post=example",
    "?post=example&reader=popup",
    "?post=example&reader=invalid",
  ])
    assert.equal(readerModeFromSearch(search), "popup");
});

test("page links canonicalize relative URLs while preserving unrelated query and hash", () => {
  assert.equal(
    canonicalNavigationUrl("/timeline?source=feed&reader=invalid#intro", {
      view: "home",
      post: "article & detail",
      readerMode: "page",
    }),
    "/?source=feed&reader=page&post=article+%26+detail#intro",
  );
});

test("normal post navigation clears a previous page preference", () => {
  for (const readerMode of [undefined, "popup"] as const) {
    assert.equal(
      canonicalNavigationUrl("/?post=old&reader=page&source=feed", {
        view: "home",
        post: "next",
        readerMode,
      }),
      "/?post=next&source=feed",
    );
  }
});

test("projects route delegates to the existing main UI", async () => {
  const source = await readFile("app/projects/page.tsx", "utf8");
  assert.match(source, /import SitePage from "\.\.\/site-page"/);
  assert.match(source, /return <SitePage \/>/);
  assert.doesNotMatch(source, /engineering-works/);
  assert.doesNotMatch(source, /public-profile/);
});

test("federation guide documents standard interoperability and is discoverable", async () => {
  const [page, footer, sitemap] = await Promise.all([
    readFile("app/federation/page.tsx", "utf8"),
    readFile("app/site-page.tsx", "utf8"),
    readFile("app/sitemap.ts", "utf8"),
  ]);
  assert.match(page, /ActivityPubに対応しています/);
  assert.match(page, /特別なkamelogアカウントや接続申請は必要ありません/);
  assert.match(page, /GET \/\.well-known\/webfinger/);
  assert.match(page, /POST \/activitypub\/inbox/);
  assert.match(page, /Like \/ EmojiReact \/ Undo/);
  assert.match(page, /Like \/ Reply \/ DM/);
  assert.match(footer, /href="\/federation"/);
  assert.match(sitemap, /new URL\("\/federation", home\)/);
});
