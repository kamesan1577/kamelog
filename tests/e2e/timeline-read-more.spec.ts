import { test, expect } from "@playwright/test";

test("timeline shows a read-more cue only for blog cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const result = await page.evaluate(() => {
    const blog = document.createElement("article");
    blog.dataset.ds = "post-card";
    blog.dataset.dsKind = "blog";
    blog.innerHTML = `
      <div data-ds="post-meta"><span data-ds="post-kind" data-kind="blog">ブログ</span></div>
      <button data-ds="post-preview"><h2>架空の記事</h2><p>最初の一文です。</p></button>
    `;
    const tweet = document.createElement("article");
    tweet.dataset.ds = "post-card";
    tweet.dataset.dsKind = "tweet";
    tweet.innerHTML = `
      <div data-ds="post-meta"><span data-ds="post-kind" data-kind="tweet">つぶやき</span></div>
      <button data-ds="post-preview"><p data-ds="tweet-body">短いつぶやき</p></button>
    `;
    document.body.append(blog, tweet);

    const blogCue = getComputedStyle(
      blog.querySelector('[data-ds="post-preview"]') as Element,
      "::after",
    ).content;
    const tweetCue = getComputedStyle(
      tweet.querySelector('[data-ds="post-preview"]') as Element,
      "::after",
    ).content;
    return { blogCue, tweetCue };
  });

  expect(result.blogCue).toContain("続きを読む");
  expect(["none", "normal", '""']).toContain(result.tweetCue);
});
