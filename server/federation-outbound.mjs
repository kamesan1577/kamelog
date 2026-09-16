import { createHash } from "node:crypto";
import { seoDescription } from "./seo.mjs";

export const ACTIVITY_STREAMS = "https://www.w3.org/ns/activitystreams";
export const PUBLIC_AUDIENCE = `${ACTIVITY_STREAMS}#Public`;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function canonicalPostUrl(config, id) {
  const url = new URL("/", config.origin);
  url.searchParams.set("post", id);
  return url.toString();
}

function textContent(value) {
  return `<p>${escapeHtml(value).replaceAll(/\r?\n/g, "<br>")}</p>`;
}

function blogContent(post, canonical) {
  const summary = seoDescription(post.body, 240);
  return [
    `<p><strong>${escapeHtml(post.title)}</strong></p>`,
    `<p>${escapeHtml(summary)}</p>`,
    `<p><a href="${escapeHtml(canonical)}">続きを読む</a></p>`,
  ].join("");
}

export function localObjectUrl(config, postId) {
  return `${config.origin}/activitypub/objects/${encodeURIComponent(postId)}`;
}

export function localPostObject(store, config, post) {
  const actor = `${config.origin}/activitypub/actor`;
  const canonical = canonicalPostUrl(config, post.id);
  const followers = `${config.origin}/activitypub/followers`;
  const attachments = (post.images || []).flatMap((path) => {
    const id = path.split("/").pop();
    const media = id ? store.get("media", id) : null;
    if (!media || media.kind !== "image") return [];
    return [
      {
        type: "Image",
        mediaType: media.type,
        url: new URL(path, config.origin).toString(),
      },
    ];
  });
  return {
    "@context": ACTIVITY_STREAMS,
    id: localObjectUrl(config, post.id),
    type: "Note",
    attributedTo: actor,
    to: [PUBLIC_AUDIENCE],
    cc: [followers],
    content:
      post.kind === "blog"
        ? blogContent(post, canonical)
        : textContent(post.body),
    url: canonical,
    published: post.date,
    updated: post.federationUpdatedAt || post.updatedAt || post.date,
    ...(attachments.length ? { attachment: attachments } : {}),
  };
}

function activityId(config, post, type) {
  return `${config.origin}/activitypub/activities/${encodeURIComponent(post.id)}/${type.toLowerCase()}/${post.revision}`;
}

function postActivity(store, config, post, type, now) {
  const actor = `${config.origin}/activitypub/actor`;
  const followers = `${config.origin}/activitypub/followers`;
  const objectId = localObjectUrl(config, post.id);
  const object =
    type === "Delete"
      ? { id: objectId, type: "Tombstone" }
      : localPostObject(store, config, post);
  const body = {
    "@context": ACTIVITY_STREAMS,
    id: activityId(config, post, type),
    type,
    actor,
    object,
    to: [PUBLIC_AUDIENCE],
    cc: [followers],
  };
  return {
    id: body.id,
    type,
    objectId,
    body,
    createdAt: now.toISOString(),
    nextAttemptAt: now.getTime(),
  };
}

function contentHash(post) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        kind: post?.kind,
        title: post?.title,
        body: post?.body,
        images: post?.images || [],
      }),
    )
    .digest("hex");
}

export function enqueuePostFederationTransition(
  store,
  config,
  post,
  previous,
  now = new Date(),
) {
  const wasEnabled = previous?.federationEnabled === true;
  const enabled = post?.federationEnabled === true;
  let type = null;
  if (!wasEnabled && enabled) type = "Create";
  else if (wasEnabled && !enabled) type = "Delete";
  else if (enabled && contentHash(previous) !== contentHash(post))
    type = "Update";
  if (!type) return null;
  const activity = postActivity(store, config, post, type, now);
  store.enqueueFederationActivity(activity, store.federationFollowerInboxes());
  return activity;
}

export function enqueuePostFederationDelete(
  store,
  config,
  post,
  now = new Date(),
) {
  if (post?.federationEnabled !== true) return null;
  const deleted = { ...post, revision: (post.revision || 0) + 1 };
  const activity = postActivity(store, config, deleted, "Delete", now);
  store.enqueueFederationActivity(activity, store.federationFollowerInboxes());
  return activity;
}
