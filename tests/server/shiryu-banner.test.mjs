import assert from "node:assert/strict";
import test from "node:test";
import { findShiryuBannerUrl } from "../../server/shiryu-banner.mjs";

test("finds the Shiryu 200x40 banner and resolves a relative URL", () => {
  const html = `
    <img src="/images/profile.png" alt="profile" width="120" height="120">
    <img src="./assets/banner.gif" alt="Shiryu のホームページ" width="200" height="40">
  `;

  assert.equal(
    findShiryuBannerUrl(html),
    "https://shiryu.win/assets/banner.gif",
  );
});

test("prefers the distributed banner over unrelated images", () => {
  const html = `
    <img src="/shiryu-avatar.png" alt="Shiryu" width="256" height="256">
    <img src="/bnr/site-banner.png" alt="Shiryu のホームページ" width="200" height="40">
  `;

  assert.equal(
    findShiryuBannerUrl(html),
    "https://shiryu.win/bnr/site-banner.png",
  );
});

test("rejects a banner hosted outside shiryu.win", () => {
  const html = `
    <img src="https://example.com/banner.gif" alt="Shiryu のホームページ" width="200" height="40">
  `;

  assert.equal(findShiryuBannerUrl(html), null);
});

test("returns null when no matching banner exists", () => {
  const html = `<img src="/logo.png" alt="logo" width="200" height="40">`;
  assert.equal(findShiryuBannerUrl(html), null);
});
