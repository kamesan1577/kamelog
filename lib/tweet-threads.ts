export type TweetThreadPost = {
  id: string;
  kind: "blog" | "tweet" | "vlog";
  date: string;
  parentId?: string;
  effectiveParentId?: string;
};

export type FlattenedTweetThread<T extends TweetThreadPost> = T & {
  threadDepth: number;
  threadRootId: string;
  threadParentMissing?: boolean;
};

type ThreadGroup<T extends TweetThreadPost> = {
  root: T;
  posts: T[];
  latestDate: string;
};

export function flattenTweetThreads<T extends TweetThreadPost>(
  posts: T[],
  matches: (post: T) => boolean = () => true,
  compareGroups?: (a: ThreadGroup<T>, b: ThreadGroup<T>) => number,
): Array<FlattenedTweetThread<T>> {
  const parentIdOf = (post: T) => post.effectiveParentId || post.parentId;
  const byId = new Map(posts.map((post) => [post.id, post]));
  const children = new Map<string, T[]>();
  const missingParentIds = new Set<string>();
  for (const post of posts) {
    const parentId = parentIdOf(post);
    if (post.kind !== "tweet" || !parentId) continue;
    const parent = byId.get(parentId);
    if (!parent || parent.kind !== "tweet") {
      missingParentIds.add(post.id);
      continue;
    }
    const list = children.get(parent.id) || [];
    list.push(post);
    children.set(parent.id, list);
  }
  for (const list of children.values())
    list.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );

  const rootFor = (post: T) => {
    let current = post;
    const seen = new Set<string>();
    while (current.kind === "tweet") {
      const parentId = parentIdOf(current);
      if (!parentId || seen.has(current.id)) break;
      seen.add(current.id);
      const parent = byId.get(parentId);
      if (!parent || parent.kind !== "tweet") break;
      current = parent;
    }
    return current;
  };
  const groups = new Map<string, ThreadGroup<T>>();
  for (const post of posts) {
    const root = rootFor(post);
    const group = groups.get(root.id) || {
      root,
      posts: [],
      latestDate: root.date,
    };
    group.posts.push(post);
    if (post.date.localeCompare(group.latestDate) > 0)
      group.latestDate = post.date;
    groups.set(root.id, group);
  }

  const result: Array<FlattenedTweetThread<T>> = [];
  for (const group of [...groups.values()].sort(
    compareGroups ||
      ((a, b) =>
        b.latestDate.localeCompare(a.latestDate) ||
        b.root.id.localeCompare(a.root.id)),
  )) {
    if (!group.posts.some(matches)) continue;
    const included = new Set<string>();
    const walk = (post: T, depth: number) => {
      if (included.has(post.id)) return;
      included.add(post.id);
      result.push({
        ...post,
        threadDepth: depth,
        threadRootId: group.root.id,
        ...(missingParentIds.has(post.id) ? { threadParentMissing: true } : {}),
      });
      for (const child of children.get(post.id) || []) walk(child, depth + 1);
    };
    walk(group.root, 0);
    for (const post of group.posts) {
      if (!included.has(post.id)) walk(post, 0);
    }
  }
  return result;
}
