const HTTP_URL = /https?:\/\/[^\s<>"'`、。！？；：「」『』【】]+/giu;
const SIMPLE_TRAILING_PUNCTUATION = /[.,!?;:、。！？；：]+$/u;

function count(value, character) {
  return [...value].filter((current) => current === character).length;
}

export function trimTweetUrl(value) {
  let result = value.replace(SIMPLE_TRAILING_PUNCTUATION, "");
  const pairs = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ];
  let changed = true;
  while (changed && result) {
    changed = false;
    for (const [open, close] of pairs) {
      if (result.endsWith(close) && count(result, close) > count(result, open)) {
        result = result
          .slice(0, -1)
          .replace(SIMPLE_TRAILING_PUNCTUATION, "");
        changed = true;
      }
    }
  }
  return result;
}

export function splitTweetText(text) {
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(HTTP_URL)) {
    const matched = match[0];
    const url = trimTweetUrl(matched);
    const start = match.index ?? 0;
    if (start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, start) });
    }
    if (url) parts.push({ type: "url", value: url });
    if (url.length < matched.length) {
      parts.push({ type: "text", value: matched.slice(url.length) });
    }
    cursor = start + matched.length;
  }
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }
  return parts.length ? parts : [{ type: "text", value: text }];
}

export function firstHttpUrl(text) {
  return splitTweetText(text).find((part) => part.type === "url")?.value ?? null;
}
