/**
 * Provider-neutral inference ports. Keep these values limited to the post
 * domain: the application layer must never receive a provider prompt or raw
 * response.
 */
export function classified(tags) {
  return { status: "classified", tags };
}

export function abstainedTags() {
  return { status: "abstained", tags: [] };
}

export function linked(parentId) {
  return { status: "linked", parentId };
}

export function independent() {
  return { status: "independent", parentId: null };
}

export function abstainedParent() {
  return { status: "abstained", parentId: null };
}

export class InferenceFailure extends Error {
  constructor(code = "unavailable") {
    super("Inference failed");
    this.code = code;
  }
}

export class InferenceUnavailable extends InferenceFailure {}

function tagsOf(candidates) {
  return new Set(
    [...candidates].map((candidate) =>
      typeof candidate === "string" ? candidate : candidate?.tag,
    ),
  );
}

function idsOf(candidates) {
  return new Set(
    [...candidates].map((candidate) =>
      typeof candidate === "string" ? candidate : candidate?.id,
    ),
  );
}

export function validateTagResult(result, candidates) {
  if (
    result?.status === "abstained" &&
    Array.isArray(result.tags) &&
    !result.tags.length
  )
    return abstainedTags();
  if (result?.status !== "classified" || !Array.isArray(result.tags))
    throw new InferenceFailure("invalid_result");
  const candidateTags = tagsOf(candidates);
  const tags = [];
  for (const item of result.tags) {
    if (!item || typeof item.tag !== "string" || !candidateTags.has(item.tag))
      throw new InferenceFailure("candidate_violation");
    if (tags.some(({ tag }) => tag === item.tag)) continue;
    // Provider confidence is deliberately ignored until calibrated.
    tags.push({ tag: item.tag });
    if (tags.length === 5) break;
  }
  // A valid empty classification clears obsolete auto tags. Abstention does not.
  return classified(tags);
}

export function validateThreadResult(result, candidates) {
  if (result?.status === "independent") return independent();
  if (result?.status === "abstained") return abstainedParent();
  if (
    result?.status !== "linked" ||
    typeof result.parentId !== "string" ||
    !idsOf(candidates).has(result.parentId)
  )
    throw new InferenceFailure("candidate_violation");
  return linked(result.parentId);
}
