import assert from "node:assert/strict";
import test from "node:test";
import { rollingReadModelCall } from "../../server/storage/rolling-read-model.ts";
import { StorageError } from "../../server/storage/errors.ts";

test("schema-13 reads and polls go directly to the Worker after one version check", () => {
  const calls: string[] = [];
  const call = rollingReadModelCall((method) => {
    calls.push(method);
    return method === "schemaVersion" ? 13 : "fixture-result";
  });
  assert.equal(call("publicMediaReference", ["fixture"]), "fixture-result");
  assert.equal(call("sitemapPosts", []), "fixture-result");
  assert.equal(call("$command", ["pollFederation", [0]]), "fixture-result");
  assert.deepEqual(calls, [
    "schemaVersion",
    "publicMediaReference",
    "sitemapPosts",
    "$command",
  ]);
});

test("schema-12 media checks read current posts and never cache publication rights", () => {
  let referenced = true;
  let checks = 0;
  const id = "11111111-1111-4111-8111-111111111111";
  const call = rollingReadModelCall((method) => {
    if (method === "schemaVersion") {
      checks++;
      return 12;
    }
    assert.equal(method, "list");
    return referenced
      ? [{ id: "fixture", kind: "tweet", images: [`/api/media/${id}`] }]
      : [];
  });
  assert.equal(call("publicMediaReference", [id]), true);
  referenced = false;
  assert.equal(call("publicMediaReference", [id]), false);
  assert.equal(checks, 1);
});

test("old Workers use existing poll RPCs until version 13 is observed", () => {
  let now = 0;
  let version = 12;
  const calls: string[] = [];
  const call = rollingReadModelCall(
    (method) => {
      calls.push(method);
      return method === "schemaVersion" ? version : null;
    },
    () => now,
  );
  assert.deepEqual(call("$command", ["pollFederation", [0]]), {
    delivery: null,
    identity: null,
  });
  assert.deepEqual(calls, [
    "schemaVersion",
    "heartbeatFederationWorker",
    "claimFederationDelivery",
  ]);
  version = 13;
  now = 300000;
  assert.equal(call("$command", ["pollFederation", [0]]), null);
  assert.deepEqual(calls.slice(-2), ["schemaVersion", "$command"]);
});

test("legacy federation pages apply cursors before limiting each source", () => {
  const call = rollingReadModelCall((method, args) => {
    if (method === "schemaVersion") return 12;
    if (method === "federationTimeline") {
      assert.deepEqual(args, [5000]);
      return ["c", "b", "a"].map((activityId) => ({
        activityId,
        activityPublishedAt: "2026-01-01",
      }));
    }
    assert.equal(method, "list");
    return ["c", "b", "a"].map((id) => ({
      id,
      kind: "tweet",
      federationEnabled: true,
      date: "2026-01-01",
    }));
  });
  assert.deepEqual(
    call("federationTimeline", [1, ["2026-01-01", "remote:b"]]),
    [{ activityId: "a", activityPublishedAt: "2026-01-01" }],
  );
  assert.deepEqual(
    call("federationLocalPosts", [["2026-01-01", "self:b"], 1]),
    [{ id: "a", kind: "tweet", federationEnabled: true, date: "2026-01-01" }],
  );
});

test("quota and migration failures never trigger a full-scan fallback", () => {
  for (const code of ["storage_limit", "storage_migrating"] as const) {
    const calls: string[] = [];
    const call = rollingReadModelCall((method) => {
      calls.push(method);
      if (method === "schemaVersion") return 13;
      throw new StorageError(code);
    });
    assert.throws(
      () => call("publicMediaReference", ["fixture"]),
      (error) => error instanceof StorageError && error.code === code,
    );
    assert.deepEqual(calls, ["schemaVersion", "publicMediaReference"]);
  }
});
