import test from "node:test";
import assert from "node:assert/strict";
import { flattenTweetThreads } from "../../lib/tweet-threads.mjs";

const post = (id, date, parentId) => ({
  id,
  kind: "tweet",
  date,
  ...(parentId ? { parentId } : {}),
});

test("flattenTweetThreads keeps matching child context and parent-first branches", () => {
  const posts = [
    post("root", "2026-01-01T00:00:00.000Z"),
    post("child-a", "2026-01-02T00:00:00.000Z", "root"),
    post("grandchild", "2026-01-03T00:00:00.000Z", "child-a"),
    post("child-b", "2026-01-02T00:00:01.000Z", "root"),
    { id: "blog", kind: "blog", date: "2026-01-04T00:00:00.000Z" },
  ];
  const result = flattenTweetThreads(posts, (item) => item.id === "grandchild");
  assert.deepEqual(
    result.map(({ id, threadDepth, threadRootId }) => ({
      id,
      threadDepth,
      threadRootId,
    })),
    [
      { id: "root", threadDepth: 0, threadRootId: "root" },
      { id: "child-a", threadDepth: 1, threadRootId: "root" },
      { id: "grandchild", threadDepth: 2, threadRootId: "root" },
      { id: "child-b", threadDepth: 1, threadRootId: "root" },
    ],
  );
});

test("flattenTweetThreads treats missing parents as independent roots", () => {
  const result = flattenTweetThreads([
    post("orphan", "2026-01-01T00:00:00.000Z", "deleted"),
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].threadDepth, 0);
  assert.equal(result[0].threadRootId, "orphan");
  assert.equal(result[0].threadParentMissing, true);
});
