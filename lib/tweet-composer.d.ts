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

export function tweetPostInput(value: {
  body: string;
  images?: string[];
  parentId?: string;
  federationEnabled?: boolean;
  tags?: string[];
  pinned?: boolean;
}): TweetPostInput;

export function hasTweetContent(body: string, images?: string[]): boolean;
