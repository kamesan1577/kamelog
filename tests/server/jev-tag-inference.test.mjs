import test from "node:test";
import assert from "node:assert/strict";
import { JevClient, JevTagInference } from "../../server/inference/jev-client.mjs";
import { InferenceFailure, InferenceUnavailable } from "../../server/inference/ports.mjs";

const candidates = [
  { tag: "Go", aliases: ["Golang"], examples: ["GoでAPIを実装した"] },
  { tag: "SQLite", aliases: [], examples: ["SQLiteの設計"] },
  { tag: "Rust", aliases: [], examples: ["RustのCLI"] },
];
const input = {
  post: { id: "test", title: "", body: "GolangとSQLiteでAPIを構築" },
  candidates,
  context: [],
};

test("Jev uses a single System One request with independent Noul questions", async () => {
  let request;
  const client = new JevClient({
    apiKey: "fictional-api-key",
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return Response.json({
        model: "jev-1.13.0",
        answers: {
          tag_0: { type: "noul", noul: 0.96 },
          tag_1: { type: "noul", noul: 0.92 },
          tag_2: { type: "noul", noul: 0.1 },
        },
      });
    },
  });
  const inference = new JevTagInference(client);
  assert.deepEqual(await inference.inferTags(input), {
    status: "classified",
    tags: [{ tag: "Go" }, { tag: "SQLite" }],
  });
  assert.equal(request.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(request.init.headers.Authorization, "Bearer fictional-api-key");
  assert.equal(request.body.model, "jev-1.13.0");
  assert.equal(Array.isArray(request.body.questions), false);
  assert.deepEqual(Object.keys(request.body.questions), ["tag_0", "tag_1", "tag_2"]);
  assert.equal(request.body.questions.tag_0.type, "noul");
  assert.match(request.body.questions.tag_0.criteria.true, /Golang/);
  assert.deepEqual(request.body.state.recentOwnerPosts, []);
  assert.equal(JSON.stringify(await inference.inferTags({ ...input, candidates: [] })), JSON.stringify({ status: "classified", tags: [] }));
});

test("low-support and empty candidates are valid empty classifications; never expose raw scores", async () => {
  const inference = new JevTagInference(new JevClient({
    apiKey: "fictional-api-key",
    fetchImpl: async () => Response.json({ answers: {
      tag_0: { type: "noul", noul: 0.84 },
      tag_1: { type: "noul", noul: 0.2 },
      tag_2: { type: "noul", noul: 0.3 },
    } }),
  }));
  assert.deepEqual(await inference.inferTags(input), { status: "classified", tags: [] });
});

test("incomplete or malformed provider answers are failures, not tag deletion", async () => {
  for (const answers of [null, {}, { tag_0: { type: "noul", noul: NaN } },
    { tag_0: { type: "noul", noul: 1.1 } }]) {
    const inference = new JevTagInference(new JevClient({
      apiKey: "fictional-api-key",
      fetchImpl: async () => Response.json({ answers }),
    }));
    await assert.rejects(inference.inferTags(input), InferenceFailure);
  }
});

test("HTTP rate limits and missing credentials are retryable errors", async () => {
  const rateLimited = new JevClient({
    apiKey: "fictional-api-key",
    fetchImpl: async () => new Response("", { status: 429 }),
  });
  await assert.rejects(rateLimited.decide({ state: "x", questions: {} }), (error) =>
    error instanceof InferenceUnavailable && error.code === "rate_limited");
  await assert.rejects(new JevClient().decide({}), (error) =>
    error instanceof InferenceUnavailable && error.code === "not_configured");
});
