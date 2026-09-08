import { test, expect } from "@playwright/test";

test("timeline shows a read-more cue only for blog cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const result = await page.evaluate(() => {
    const blog = document.createElement("article");
    blog.className = "post";
    blog.innerHTML = `
      <div class="post-meta"><span class="type-label blog">ブログ</span></div>
      <button class="post-focus"><h2>架空の記事</h2><p>最初の一文です。</p></button>
    `;
    const tweet = document.createElement("article");
    tweet.className = "post";
    tweet.innerHTML = `
      <div class="post-meta"><span class="type-label tweet">つぶやき</span></div>
      <button class="post-focus"><p class="tweet-body">短いつぶやき</p></button>
    `;
    document.body.append(blog, tweet);

    const blogCue = getComputedStyle(
      blog.querySelector(".post-focus") as Element,
      "::after",
    ).content;
    const tweetCue = getComputedStyle(
      tweet.querySelector(".post-focus") as Element,
      "::after",
    ).content;
    return { blogCue, tweetCue };
  });

  expect(result.blogCue).toContain("続きを読む");
  expect(["none", "normal", '""']).toContain(result.tweetCue);
});
