/**
 * Provider-neutral inference ports. Keep these values limited to the post
 * domain: the application layer must never receive a provider prompt or raw
 * response.
 */
export type InferredTag = { tag: string };
export type TagInferenceResult =
  | { status: "classified"; tags: InferredTag[] }
  | { status: "abstained"; tags: [] };
export type ThreadInferenceResult =
  | { status: "linked"; parentId: string }
  | { status: "independent" | "abstained"; parentId: null };

export type TagCandidate = string | { tag?: string };
export type ThreadCandidate = string | { id?: string };

export function classified(tags: InferredTag[]): TagInferenceResult {
  return { status: "classified", tags };
}

export function abstainedTags(): TagInferenceResult {
  return { status: "abstained", tags: [] };
}

export function linked(parentId: string): ThreadInferenceResult {
  return { status: "linked", parentId };
}

export function independent(): ThreadInferenceResult {
  return { status: "independent", parentId: null };
}

export function abstainedParent(): ThreadInferenceResult {
  return { status: "abstained", parentId: null };
}

export class InferenceFailure extends Error {
  readonly code: string;

  constructor(code = "unavailable") {
    super("Inference failed");
    this.code = code;
  }
}

export class InferenceUnavailable extends InferenceFailure {}

function tagsOf(candidates: Iterable<TagCandidate>) {
  return new Set(
    [...candidates].map((candidate) =>
      typeof candidate === "string" ? candidate : candidate?.tag,
    ),
  );
}

function idsOf(candidates: Iterable<ThreadCandidate>) {
  return new Set(
    [...candidates].map((candidate) =>
      typeof candidate === "string" ? candidate : candidate?.id,
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

export function validateTagResult(
  result: unknown,
  candidates: Iterable<TagCandidate>,
): TagInferenceResult {
  if (
    isRecord(result) &&
    result.status === "abstained" &&
    Array.isArray(result.tags) &&
    !result.tags.length
  )
    return abstainedTags();
  if (
    !isRecord(result) ||
    result.status !== "classified" ||
    !Array.isArray(result.tags)
  )
    throw new InferenceFailure("invalid_result");
  const candidateTags = tagsOf(candidates);
  const tags: InferredTag[] = [];
  for (const item of result.tags) {
    if (
      !isRecord(item) ||
      typeof item.tag !== "string" ||
      !candidateTags.has(item.tag)
    )
      throw new InferenceFailure("candidate_violation");
    if (tags.some(({ tag }) => tag === item.tag)) continue;
    // Provider confidence is deliberately ignored until calibrated.
    tags.push({ tag: item.tag });
    if (tags.length === 5) break;
  }
  // A valid empty classification clears obsolete auto tags. Abstention does not.
  return classified(tags);
}

export function validateThreadResult(
  result: unknown,
  candidates: Iterable<ThreadCandidate>,
): ThreadInferenceResult {
  if (isRecord(result) && result.status === "independent")
    return independent();
  if (isRecord(result) && result.status === "abstained")
    return abstainedParent();
  if (
    !isRecord(result) ||
    result.status !== "linked" ||
    typeof result.parentId !== "string" ||
    !idsOf(candidates).has(result.parentId)
  )
    throw new InferenceFailure("candidate_violation");
  return linked(result.parentId);
}
