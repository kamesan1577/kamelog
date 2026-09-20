import { hash } from "./store.mjs";
import { extractHashtags } from "./validation.mjs";
import { TagRepository } from "./tag-repository.mjs";
import { LocalTagInference } from "./inference/local-tag-inference.mjs";
import { validateTagResult } from "./inference/ports.mjs";

// Retained for the explicit local classifier and its historical tests.
export const AUTO_TAG_MODEL_VERSION = "local-tfidf-v1";
const AUTO_TAG_THRESHOLD = 0.42;
const MAX_AUTO_TAGS = 5;
const DEFAULT_CANDIDATES = 15;
const hashtagPattern = /#[\p{L}\p{N}_-]+/gu;

function textOf(post) {
  return `${post.title || ""}\n${post.body || ""}`.replace(hashtagPattern, " ");
}

function normalize(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP");
}

// The old classifier remains an explicitly selectable, local implementation.
function features(text) {
  const value = normalize(text);
  const tokens = new Map();
  for (const word of value.match(/[\p{L}\p{N}]+/gu) || [])
    tokens.set(`w:${word}`, (tokens.get(`w:${word}`) || 0) + 1);
  const compact = value.replace(/\s+/gu, "");
  for (let index = 0; index < compact.length - 1; index++) {
    const pair = compact.slice(index, index + 2);
    if (/^[\p{L}\p{N}]{2}$/u.test(pair))
      tokens.set(`c:${pair}`, (tokens.get(`c:${pair}`) || 0) + 1);
  }
  return tokens;
}

function contentHash(post) {
  return hash(`${post.title || ""}\n${post.body || ""}`);
}

function manualTags(post) {
  const automatic = new Set((post.autoTags || []).map(({ tag }) => tag));
  return (post.tags || []).filter((tag) => !automatic.has(tag));
}

function cosine(left, right, idf) {
  let leftLength = 0;
  let rightLength = 0;
  let dot = 0;
  for (const [feature, count] of left) {
    const weight = count * (idf.get(feature) || 1);
    leftLength += weight * weight;
    const other = right.get(feature);
    if (other) dot += weight * other * (idf.get(feature) || 1);
  }
  for (const [feature, count] of right) {
    const weight = count * (idf.get(feature) || 1);
    rightLength += weight * weight;
  }
  return leftLength && rightLength
    ? dot / Math.sqrt(leftLength * rightLength)
    : 0;
}

function lexicalScore(tag, text) {
  const tagFeatures = features(tag);
  const textFeatures = features(text);
  let matched = 0;
  let total = 0;
  for (const [feature, count] of tagFeatures) {
    total += count;
    if (textFeatures.has(feature)) matched += count;
  }
  return total ? matched / total : 0;
}

function trainingHash(posts) {
  return hash(
    posts
      .filter((post) => manualTags(post).length)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(
        (post) =>
          `${post.id}:${post.revision || 0}:${manualTags(post).join("\u001f")}`,
      )
      .join("\n"),
  );
}

export function classifyPosts(posts) {
  const documents = posts.map((post) => features(textOf(post)));
  const documentFrequency = new Map();
  for (const document of documents)
    for (const feature of document.keys())
      documentFrequency.set(feature, (documentFrequency.get(feature) || 0) + 1);
  const idf = new Map(
    [...documentFrequency].map(([feature, count]) => [
      feature,
      Math.log((posts.length + 1) / (count + 1)) + 1,
    ]),
  );
  const candidates = new Map();
  for (const post of posts)
    for (const tag of manualTags(post)) {
      if (!candidates.has(tag)) candidates.set(tag, []);
      candidates.get(tag).push(post);
    }
  const result = new Map();
  for (const post of posts) {
    const text = textOf(post);
    const document = features(text);
    const tags = [];
    for (const [tag, exemplars] of candidates) {
      if (manualTags(post).includes(tag)) continue;
      const similarity = Math.max(
        ...exemplars.map((exemplar) =>
          cosine(document, features(textOf(exemplar)), idf),
        ),
      );
      const score = Math.max(similarity, lexicalScore(tag, text) * 0.9);
      if (score >= AUTO_TAG_THRESHOLD)
        tags.push({ tag, confidence: Number(Math.min(score, 1).toFixed(4)) });
    }
    tags.sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.tag.localeCompare(right.tag, "ja"),
    );
    result.set(post.id, tags.slice(0, MAX_AUTO_TAGS));
  }
  return { result, trainingHash: trainingHash(posts) };
}

function createCandidates(posts, manual, aliasesByTag) {
  const examples = new Map();
  // Only publicly published owner posts are in `posts`; drafts and remote posts
  // are separate collections and are never read by this use case.
  for (const post of posts)
    for (const tag of manual.get(post.id) || []) {
      if (!examples.has(tag)) examples.set(tag, []);
      if (examples.get(tag).length < 3)
        examples.get(tag).push(textOf(post).slice(0, 500));
    }
  return [...examples].map(([tag, samples]) => ({
    tag,
    aliases: Array.isArray(aliasesByTag[tag])
      ? aliasesByTag[tag]
          .filter((alias) => typeof alias === "string" && alias.length <= 80)
          .slice(0, 8)
      : [],
    examples: samples,
  }));
}

/** Keep literal name/alias matches ahead of the bounded semantic shortlist. */
export function selectTagCandidates(
  post,
  candidates,
  limit = DEFAULT_CANDIDATES,
) {
  const text = normalize(textOf(post));
  const ranked = candidates.map((candidate) => {
    const names = [candidate.tag, ...candidate.aliases]
      .map(normalize)
      .filter(Boolean);
    const exact = names.some((name) => text.includes(name));
    const lexical = Math.max(
      0,
      ...names.map((name) => lexicalScore(name, text)),
    );
    const exemplar = Math.max(
      0,
      ...candidate.examples.map((sample) =>
        lexicalScore(sample.slice(0, 60), text),
      ),
    );
    return { candidate, exact, score: lexical + exemplar * 0.1 };
  });
  ranked.sort(
    (a, b) =>
      Number(b.exact) - Number(a.exact) ||
      b.score - a.score ||
      a.candidate.tag.localeCompare(b.candidate.tag, "ja"),
  );
  // Do not silently discard an explicitly matching name when >limit match.
  const exactCount = ranked.filter((item) => item.exact).length;
  return ranked
    .slice(0, Math.max(limit, exactCount))
    .map(({ candidate }) => candidate);
}

export async function autoTagPosts(
  store,
  {
    tagInference = new LocalTagInference(),
    requireEnabled = false,
    aliases = null,
    candidateLimit = DEFAULT_CANDIDATES,
  } = {},
) {
  if (requireEnabled && !store.inferenceSettings()?.autoTagEnabled)
    return { processed: 0, skipped: 0, failed: 0, posts: 0, disabled: true };
  const repository = new TagRepository(store);
  const posts = store.list("posts");
  const manual = repository.manualTags();
  const aliasesByTag = aliases ?? repository.aliases();
  const allCandidates = createCandidates(posts, manual, aliasesByTag);
  const currentTrainingHash = hash(
    JSON.stringify({
      training: posts
        .filter((post) => (manual.get(post.id) || []).length)
        .map((post) => [post.id, post.revision || 0, manual.get(post.id)])
        .sort(([a], [b]) => a.localeCompare(b)),
      aliases: allCandidates.map(({ tag, aliases: names }) => [tag, names]),
    }),
  );
  const modelVersion = tagInference.modelVersion || AUTO_TAG_MODEL_VERSION;
  const engineId = tagInference.engineId || "local-tfidf";
  const providerId = tagInference.providerId || "local";
  const adapterVersion = tagInference.adapterVersion || AUTO_TAG_MODEL_VERSION;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  for (const post of posts) {
    if (requireEnabled && !store.inferenceSettings()?.autoTagEnabled) break;
    const run = store.autoTagState(post.id);
    const currentContentHash = contentHash(post);
    if (
      run?.content_hash === currentContentHash &&
      run.model_version === modelVersion &&
      run.training_hash === currentTrainingHash
    ) {
      skipped++;
      continue;
    }
    const manualForPost = manual.get(post.id) || [];
    const candidates = selectTagCandidates(
      post,
      allCandidates.filter(({ tag }) => !manualForPost.includes(tag)),
      candidateLimit,
    );
    const canonical = new Set(allCandidates.map(({ tag }) => tag));
    const explicit = extractHashtags(post.title, post.body).filter(
      (tag) => canonical.has(tag) && !manualForPost.includes(tag),
    );
    const shortPost = textOf(post).trim().length < 35;
    const context = shortPost
      ? posts
          .filter(
            (previous) =>
              previous.id !== post.id &&
              String(previous.createdAt || "") <= String(post.createdAt || ""),
          )
          .slice(-3)
          .map(({ id, title, body }) => ({
            id,
            title: (title || "").slice(0, 120),
            body: (body || "").slice(0, 500),
          }))
      : [];
    try {
      const inference = candidates.length
        ? await tagInference.inferTags({
            post: {
              id: post.id,
              title: (post.title || "")
                .replace(hashtagPattern, " ")
                .slice(0, 300),
              body: (post.body || "")
                .replace(hashtagPattern, " ")
                .slice(0, 12_000),
            },
            candidates,
            context,
          })
        : { status: "classified", tags: [] };
      const result = validateTagResult(inference, candidates);
      // An explicit abstention is not a successful empty classification.
      if (result.status !== "classified") {
        failed++;
        continue;
      }
      const tags = [
        ...new Set([...explicit, ...result.tags.map(({ tag }) => tag)]),
      ]
        .slice(0, MAX_AUTO_TAGS)
        .map((tag) => ({ tag }));
      const saved = repository.replace(post.id, tags, {
        contentHash: currentContentHash,
        modelVersion,
        trainingHash: currentTrainingHash,
        manualTags: manualForPost,
        engineId,
        providerId,
        adapterVersion,
        candidateHash: hash(JSON.stringify(candidates)),
        requireEnabled,
      });
      if (saved) processed++;
      else skipped++;
    } catch (error) {
      // Never clear existing tags or advance post_tag_runs on provider failure.
      // The unchanged run makes the existing oneshot timer retry on its next tick.
      failed++;
      if (error?.code === "not_configured") break;
    }
  }
  return {
    processed,
    skipped,
    failed,
    posts: posts.length,
    trainingHash: currentTrainingHash,
  };
}
