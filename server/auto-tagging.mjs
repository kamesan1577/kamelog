import { hash } from "./store.mjs";

export const AUTO_TAG_MODEL_VERSION = "local-tfidf-v1";
const AUTO_TAG_THRESHOLD = 0.42;
const MAX_AUTO_TAGS = 5;
const hashtagPattern = /#[\p{L}\p{N}_-]+/gu;

function textOf(post) {
  return `${post.title || ""}\n${post.body || ""}`.replace(hashtagPattern, " ");
}

function normalize(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ja-JP");
}

// Word tokens cover English/technical terms. Japanese bigrams keep the
// classifier useful without a tokenizer or a downloaded model.
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

export function autoTagPosts(store) {
  const posts = store.list("posts");
  const { result, trainingHash: currentTrainingHash } = classifyPosts(posts);
  let processed = 0;
  let skipped = 0;
  for (const post of posts) {
    const run = store.autoTagState(post.id);
    const currentContentHash = contentHash(post);
    if (
      run?.content_hash === currentContentHash &&
      run.model_version === AUTO_TAG_MODEL_VERSION &&
      run.training_hash === currentTrainingHash
    ) {
      skipped++;
      continue;
    }
    store.replaceAutoTags(post.id, result.get(post.id) || [], {
      contentHash: currentContentHash,
      modelVersion: AUTO_TAG_MODEL_VERSION,
      trainingHash: currentTrainingHash,
    });
    processed++;
  }
  return {
    processed,
    skipped,
    posts: posts.length,
    trainingHash: currentTrainingHash,
  };
}
