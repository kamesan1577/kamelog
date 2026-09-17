/**
 * Build the single payload contract shared by inline tweets, modal tweets,
 * and replies. The parent reference is the only context-specific field.
 * @param {{body: string, images?: string[], parentId?: string, federationEnabled?: boolean, tags?: string[], pinned?: boolean}} value
 * @returns {{kind: "tweet", title: "", body: string, tags: string[], pinned: boolean, images: string[], federationEnabled: boolean, parentId?: string}}
 */
export function tweetPostInput({
  body,
  images = [],
  parentId,
  federationEnabled = false,
  tags = [],
  pinned = false,
}) {
  return {
    kind: "tweet",
    title: "",
    body: String(body || "").trim(),
    tags,
    pinned,
    images: [...images],
    federationEnabled,
    ...(parentId ? { parentId } : {}),
  };
}

/** @param {string} body @param {string[]} [images] */
export function hasTweetContent(body, images = []) {
  return Boolean(String(body || "").trim() || images.length);
}
