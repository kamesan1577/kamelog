export type TweetThreadPost = {
  id: string;
  kind: "blog" | "tweet" | "vlog";
  date: string;
  parentId?: string;
};

export type FlattenedTweetThread<T extends TweetThreadPost> = T & {
  threadDepth: number;
  threadRootId: string;
  threadParentMissing?: boolean;
};

export function flattenTweetThreads<T extends TweetThreadPost>(
  posts: T[],
  matches?: (post: T) => boolean,
  compareGroups?: (
    a: { root: T; latestDate: string },
    b: { root: T; latestDate: string },
  ) => number,
): Array<FlattenedTweetThread<T>>;
