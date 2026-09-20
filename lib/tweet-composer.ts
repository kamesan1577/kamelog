export type TweetPostInput = {
  kind: "tweet";
  title: "";
  body: string;
  tags: string[];
  pinned: boolean;
  images: string[];
  federationEnabled: boolean;
  parentId?: string;
};

export function tweetPostInput({
  body,
  images = [],
  parentId,
  federationEnabled = false,
  tags = [],
  pinned = false,
}: {
  body: string;
  images?: string[];
  parentId?: string;
  federationEnabled?: boolean;
  tags?: string[];
  pinned?: boolean;
}): TweetPostInput {
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

export function hasTweetContent(body: string, images: string[] = []) {
  return Boolean(String(body || "").trim() || images.length);
}
