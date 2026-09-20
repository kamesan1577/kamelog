import twitter from "twitter-text";

const LIMIT = 280;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type XSharePost = {
  kind: string;
  title: string;
  body?: string;
};

export function getXWeightedLength(text: string) {
  return twitter.parseTweet(text).weightedLength;
}

export function truncateForX(body: string, url: string) {
  const text = body.trim();
  if (getXWeightedLength(`${text}\n${url}`) <= LIMIT) return `${text}\n${url}`;
  const suffix = `\n...\n${url}`;
  let prefix = "";
  for (const { segment } of segmenter.segment(text)) {
    if (getXWeightedLength(prefix + segment + suffix) > LIMIT) break;
    prefix += segment;
  }
  const boundary = Math.max(
    prefix.lastIndexOf("\n"),
    prefix.lastIndexOf("。"),
    prefix.lastIndexOf(" "),
  );
  if (boundary > prefix.length * 0.85)
    prefix = prefix.slice(0, boundary + (prefix[boundary] === "。" ? 1 : 0));
  return prefix.trimEnd() + suffix;
}

export function buildXShareText(post: XSharePost, url: string) {
  return truncateForX(
    post.kind === "blog" ? post.title : post.body || post.title,
    url,
  );
}

export function buildXIntentUrl(post: XSharePost, url: string) {
  const intent = new URL("https://x.com/intent/tweet");
  intent.searchParams.set("text", buildXShareText(post, url));
  return intent.toString();
}
