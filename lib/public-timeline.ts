export type PublicTimelineFilter = "all" | "blog" | "tweet" | "vlog";
export type PublicTimelineSort = "new" | "popular";

type LocalTimelineItem = {
  id: string;
  date: string;
  likes: number;
  pinned?: boolean;
  threadRootId?: string;
};

type PublicRepostTimelineItem = {
  id: string;
  kind: "repost";
  date: string;
  likes: number;
  displayName: string;
  handle: string;
  contentHtml: string;
};

export function filterPublicReposts<T extends PublicRepostTimelineItem>(
  reposts: T[],
  filter: PublicTimelineFilter,
  tag: string,
  query: string,
): T[] {
  if ((filter !== "all" && filter !== "tweet") || tag) return [];

  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) return reposts;

  return reposts.filter((repost) =>
    (
      repost.displayName +
      " " +
      repost.handle +
      " " +
      repost.contentHtml.replace(/<[^>]+>/g, " ")
    )
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

type TimelineGroup<T> = {
  key: string;
  id: string;
  items: T[];
  date: string;
  likes: number;
  pinned: boolean;
};

export function mergePublicTimelineItems<
  P extends LocalTimelineItem,
  R extends PublicRepostTimelineItem,
>(posts: P[], reposts: R[], sort: PublicTimelineSort): Array<P | R> {
  const groups: TimelineGroup<P | R>[] = [];

  for (const post of posts) {
    const key = post.threadRootId || post.id;
    const current = groups.at(-1);
    if (current?.key === key) {
      current.items.push(post);
      if (post.date.localeCompare(current.date) > 0) current.date = post.date;
      continue;
    }

    groups.push({
      key,
      id: post.id,
      items: [post],
      date: post.date,
      likes: post.likes,
      pinned: post.pinned === true,
    });
  }

  for (const repost of reposts) {
    groups.push({
      key: repost.id,
      id: repost.id,
      items: [repost],
      date: repost.date,
      likes: repost.likes,
      pinned: false,
    });
  }

  return groups
    .sort((left, right) =>
      sort === "popular"
        ? right.likes - left.likes ||
          right.date.localeCompare(left.date) ||
          right.id.localeCompare(left.id)
        : +right.pinned - +left.pinned ||
          right.date.localeCompare(left.date) ||
          right.id.localeCompare(left.id),
    )
    .flatMap((group) => group.items);
}
