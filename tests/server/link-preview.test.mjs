import assert from "node:assert/strict";
import test from "node:test";
import {
  isPrivateAddress,
  normalizePreviewUrl,
  parsePreviewMetadata,
} from "../../server/link-preview.mjs";

test("link preview parser accepts common OGP attribute orders and relative images", () => {
  const preview = parsePreviewMetadata(
    `<!doctype html><html><head>
      <meta content="架空 &amp; 記事" property="og:title">
      <meta name="description" content="架空の説明">
      <meta property="og:image" content="/cover.png">
      <meta property="og:site_name" content="Example Site">
    </head></html>`,
    "https://example.com/posts/1",
  );
  assert.deepEqual(preview, {
    url: "https://example.com/posts/1",
    title: "架空 & 記事",
    description: "架空の説明",
    image: "https://example.com/cover.png",
    siteName: "Example Site",
  });
});

test("private and reserved addresses are rejected by the SSRF boundary", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.5",
    "169.254.1.1",
    "192.168.1.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
  ]) {
    assert.equal(isPrivateAddress(address), true, address);
  }
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
});

test("preview URLs allow only public-web schemes and default ports", () => {
  assert.equal(
    normalizePreviewUrl("https://example.com/a#fragment").href,
    "https://example.com/a",
  );
  assert.throws(() => normalizePreviewUrl("ftp://example.com/file"));
  assert.throws(() => normalizePreviewUrl("http://localhost/test"));
  assert.throws(() => normalizePreviewUrl("https://example.com:8443/test"));
  assert.throws(() =>
    normalizePreviewUrl("https://user:pass@example.com/test"),
  );
});
