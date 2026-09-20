export function flattenTweetThreads(
  posts,
  matches = () => true,
  compareGroups,
) {
  const parentIdOf = (post) => post.effectiveParentId || post.parentId;
  const byId = new Map(posts.map((post) => [post.id, post]));
  const children = new Map();
  const missingParentIds = new Set();
  for (const post of posts) {
    if (post.kind !== "tweet" || !parentIdOf(post)) continue;
    const parent = byId.get(parentIdOf(post));
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

  const rootFor = (post) => {
    let current = post;
    const seen = new Set();
    while (current.kind === "tweet" && parentIdOf(current)) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      const parent = byId.get(parentIdOf(current));
      if (!parent || parent.kind !== "tweet") break;
      current = parent;
    }
    return current;
  };
  const groups = new Map();
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

  const result = [];
  for (const group of [...groups.values()].sort(
    compareGroups ||
      ((a, b) =>
        b.latestDate.localeCompare(a.latestDate) ||
        b.root.id.localeCompare(a.root.id)),
  )) {
    if (!group.posts.some(matches)) continue;
    const included = new Set();
    const walk = (post, depth) => {
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
