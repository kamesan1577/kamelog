import { hash } from "./store.mjs";
import {
  InferenceFailure,
  abstainedParent,
  independent,
  validateThreadResult,
} from "./inference/ports.mjs";

const windowMs = 30 * 60 * 1000;
const maxCandidates = 5;

export function threadCandidates(posts, post) {
  const when = Date.parse(post.date);
  return posts
    .filter(
      (candidate) =>
        candidate.kind === "tweet" &&
        candidate.id !== post.id &&
        !candidate.parentId &&
        !candidate.effectiveParentId &&
        Date.parse(candidate.date) < when &&
        when - Date.parse(candidate.date) <= windowMs,
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, maxCandidates)
    .map(({ id, body, date }) => ({ id, body: body || "", createdAt: date }));
}

export async function inferThreadForPost(store, postId, threadInference) {
  const post = store.get("posts", postId);
  if (!post || post.kind !== "tweet" || post.parentId)
    return { status: "skipped" };
  const existing = store.inferredThreadLink(post.id);
  if (existing?.state === "rejected") return { status: "skipped" };
  const candidates = threadCandidates(store.list("posts"), post);
  const inputHash = hash(
    JSON.stringify({
      post: { id: post.id, body: post.body, date: post.date },
      candidates,
    }),
  );
  const result = candidates.length
    ? await threadInference.inferParent({
        post: { id: post.id, body: post.body || "" },
        candidates,
      })
    : independent();
  const decision = validateThreadResult(
    result || abstainedParent(),
    candidates,
  );
  if (decision.status === "linked" && decision.parentId === post.id)
    throw new InferenceFailure("cycle");
  store.saveInferredThreadLink({
    postId: post.id,
    parentId: decision.parentId,
    state: decision.status,
    engineId: threadInference.constructor.name,
    inputHash,
  });
  return decision;
}

export async function processThreadInferenceJobs(
  store,
  threadInference,
  { now = Date.now(), limit = 20 } = {},
) {
  const jobs = store.claimInferenceJobs("thread", now, limit);
  const summary = {
    processed: 0,
    linked: 0,
    independent: 0,
    abstained: 0,
    retried: 0,
    dead: 0,
  };
  for (const job of jobs) {
    try {
      const result = await inferThreadForPost(
        store,
        job.post_id,
        threadInference,
      );
      const state =
        result.status === "linked" || result.status === "independent"
          ? "succeeded"
          : result.status === "skipped"
            ? "cancelled"
            : result.status;
      store.finishInferenceJob(job.id, state);
      summary.processed++;
      if (result.status in summary) summary[result.status]++;
    } catch (error) {
      const errorCode = error?.code || "failed";
      console.warn(
        JSON.stringify({
          event: "thread_inference_job_failed",
          postId: job.post_id,
          errorCode,
          ...(Number.isInteger(error?.httpStatus)
            ? { httpStatus: error.httpStatus }
            : {}),
        }),
      );
      const retryable =
        error instanceof InferenceFailure &&
        ["timeout", "network", "rate_limited", "remote_error"].includes(
          error.code,
        ) &&
        !(
          error.code === "remote_error" &&
          error.httpStatus >= 400 &&
          error.httpStatus < 500
        );
      if (retryable && job.attempts < 3) {
        store.finishInferenceJob(job.id, "retry", {
          errorCode,
          retryAt: now + 60_000 * 2 ** (job.attempts - 1),
        });
        summary.retried++;
      } else {
        store.finishInferenceJob(job.id, "dead", {
          errorCode,
        });
        summary.dead++;
      }
    }
  }
  return summary;
}
