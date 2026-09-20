import test from "node:test";
import assert from "node:assert/strict";
import {
  InferenceFailure,
  validateTagResult,
  validateThreadResult,
} from "../../server/inference/ports.mjs";

test("tag port rejects provider output outside the supplied candidate domain", () => {
  assert.deepEqual(
    validateTagResult({ status: "classified", tags: [{ tag: "Go" }] }, [
      { tag: "Go", aliases: [], examples: [] },
    ]),
    { status: "classified", tags: [{ tag: "Go" }] },
  );
  assert.throws(
    () =>
      validateTagResult({ status: "classified", tags: [{ tag: "Rust" }] }, []),
    InferenceFailure,
  );
});

test("thread port preserves independent versus abstained and rejects foreign parents", () => {
  const candidates = [
    { id: "before", body: "context", createdAt: "2026-01-01T00:00:00Z" },
  ];
  assert.deepEqual(
    validateThreadResult({ status: "independent", parentId: null }, candidates),
    { status: "independent", parentId: null },
  );
  assert.deepEqual(
    validateThreadResult({ status: "abstained", parentId: null }, candidates),
    { status: "abstained", parentId: null },
  );
  assert.throws(
    () =>
      validateThreadResult(
        { status: "linked", parentId: "not-a-candidate" },
        candidates,
      ),
    InferenceFailure,
  );
});
