import assert from "node:assert/strict";
import test from "node:test";
import {
  filterPublicReposts,
  mergePublicTimelineItems,
} from "../../lib/public-timeline.ts";

const reposts = [
  {
    id: "repost:one",
    kind: "repost" as const,
    date: "2026-09-27T12:00:00.000Z",
    likes: 0,
    displayName: "Remote User",
    handle: "@remote@example.com",
    contentHtml: "<p>Hello federation</p>",
  },
];

test("public RP appears in all and tweet filters only", () => {
  assert.equal(filterPublicReposts(reposts, "all", "", "").length, 1);
  assert.equal(filterPublicReposts(reposts, "tweet", "", "").length, 1);
  assert.equal(filterPublicReposts(reposts, "blog", "", "").length, 0);
  assert.equal(filterPublicReposts(reposts, "vlog", "", "").length, 0);
  assert.equal(filterPublicReposts(reposts, "tweet", "Go", "").length, 0);
});

test("public RP search matches author, handle, and sanitized text", () => {
  assert.equal(filterPublicReposts(reposts, "tweet", "", "remote").length, 1);
  assert.equal(
    filterPublicReposts(reposts, "tweet", "", "federation").length,
    1,
  );
  assert.equal(filterPublicReposts(reposts, "tweet", "", "missing").length, 0);
});

test("new timeline merges RP by repost time without splitting tweet threads", () => {
  const posts = [
    {
      id: "root",
      kind: "tweet" as const,
      date: "2026-09-20T00:00:00.000Z",
      likes: 1,
      threadRootId: "root",
      threadDepth: 0,
    },
    {
      id: "child",
      kind: "tweet" as const,
      date: "2026-09-28T00:00:00.000Z",
      likes: 0,
      threadRootId: "root",
      threadDepth: 1,
    },
    {
      id: "standalone",
      kind: "tweet" as const,
      date: "2026-09-25T00:00:00.000Z",
      likes: 0,
      threadRootId: "standalone",
      threadDepth: 0,
    },
  ];
  const remote = [
    {
      ...reposts[0],
      date: "2026-09-27T00:00:00.000Z",
    },
  ];

  const result = mergePublicTimelineItems(posts, remote, "new");

  assert.deepEqual(
    result.map((item) => item.id),
    ["root", "child", "repost:one", "standalone"],
  );
});

test("popular timeline compares RP with local groups without splitting threads", () => {
  const posts = [
    {
      id: "popular-root",
      kind: "tweet" as const,
      date: "2026-09-20T00:00:00.000Z",
      likes: 5,
      threadRootId: "popular-root",
      threadDepth: 0,
    },
    {
      id: "popular-child",
      kind: "tweet" as const,
      date: "2026-09-28T00:00:00.000Z",
      likes: 0,
      threadRootId: "popular-root",
      threadDepth: 1,
    },
    {
      id: "zero-like",
      kind: "blog" as const,
      date: "2026-09-21T00:00:00.000Z",
      likes: 0,
      threadRootId: "zero-like",
      threadDepth: 0,
    },
  ];
  const remote = [
    {
      ...reposts[0],
      date: "2026-09-27T00:00:00.000Z",
    },
  ];

  const result = mergePublicTimelineItems(posts, remote, "popular");

  assert.deepEqual(
    result.map((item) => item.id),
    ["popular-root", "popular-child", "repost:one", "zero-like"],
  );
});
