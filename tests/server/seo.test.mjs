import assert from "node:assert/strict";
import test from "node:test";
import {
  blogStructuredData,
  homeUrl,
  ogImageUrl,
  postUrl,
  seoDescription,
  siteOrigin,
  websiteStructuredData,
} from "../../server/seo.mjs";

const productionLocal = {
  NODE_ENV: "production",
  KAMELOG_ORIGIN: "http://localhost:3000",
};

test("production SEO never emits a loopback origin", () => {
  assert.equal(siteOrigin(productionLocal), "https://kamesan.org");
  assert.equal(homeUrl(productionLocal), "https://kamesan.org/");
  assert.equal(
    postUrl("fictional-post", productionLocal),
    "https://kamesan.org/?post=fictional-post",
  );
  assert.equal(
    ogImageUrl("fictional-post", productionLocal),
    "https://kamesan.org/og?post=fictional-post",
  );
});

test("development may use an explicit loopback origin", () => {
  const env = {
    NODE_ENV: "development",
    KAMELOG_ORIGIN: "http://localhost:3000",
  };
  assert.equal(siteOrigin(env), "http://localhost:3000");
  assert.equal(postUrl("abc", env), "http://localhost:3000/?post=abc");
});

test("public origin must be an origin without credentials or paths", () => {
  assert.throws(() =>
    siteOrigin({
      NODE_ENV: "production",
      KAMELOG_ORIGIN: "https://example.com/path",
    }),
  );
  assert.throws(() =>
    siteOrigin({
      NODE_ENV: "production",
      KAMELOG_ORIGIN: "https://user:pass@example.com",
    }),
  );
});

test("SEO description strips markdown and truncates long bodies", () => {
  assert.equal(
    seoDescription("# 見出し\n\n**本文**と[リンク](https://example.com)"),
    "見出し 本文とリンク",
  );
  const description = seoDescription("あ".repeat(200));
  assert.equal(Array.from(description).length, 160);
  assert.match(description, /…$/);
});

test("structured data uses public profile and post timestamps", () => {
  const env = {
    NODE_ENV: "production",
    KAMELOG_ORIGIN: "https://example.com",
  };
  const profile = { name: "架空の作者" };
  const [website, person] = websiteStructuredData(profile, env);
  assert.equal(website["@type"], "WebSite");
  assert.equal(website.url, "https://example.com/");
  assert.equal(person["@type"], "Person");
  assert.equal(person.name, "架空の作者");

  const blog = blogStructuredData(
    {
      id: "fictional-blog",
      kind: "blog",
      title: "架空の記事",
      body: "本文です。",
      date: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-02-03T04:05:06.000Z",
    },
    profile,
    env,
  );
  assert.equal(blog["@type"], "BlogPosting");
  assert.equal(blog.headline, "架空の記事");
  assert.equal(blog.datePublished, "2026-01-02T03:04:05.000Z");
  assert.equal(blog.dateModified, "2026-02-03T04:05:06.000Z");
  assert.equal(blog.mainEntityOfPage, "https://example.com/?post=fictional-blog");
  assert.deepEqual(blog.image, [
    "https://example.com/og?post=fictional-blog",
  ]);

  assert.equal(
    blogStructuredData(
      { id: "tweet", kind: "tweet", title: "", body: "本文" },
      profile,
      env,
    ),
    null,
  );
});
