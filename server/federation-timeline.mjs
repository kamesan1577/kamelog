import { localPostObject } from "./federation-outbound.mjs";
import { hash } from "./store.mjs";

export class InvalidFederationCursor extends TypeError {}

function remoteHandle(item) {
  if (item.handle) return item.handle;
  try {
    return `@${item.preferredUsername}@${new URL(item.actorId).host}`;
  } catch {
    return `@${item.preferredUsername}`;
  }
}

function parseCursor(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 1_024)
    throw new InvalidFederationCursor("invalid timeline cursor");
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      !Number.isFinite(Date.parse(decoded[0])) ||
      typeof decoded[1] !== "string" ||
      decoded[1].length > 2_048
    )
      throw new Error("invalid cursor");
    return decoded;
  } catch {
    throw new InvalidFederationCursor("invalid timeline cursor");
  }
}

function afterCursor(item, cursor) {
  if (!cursor) return true;
  return (
    item.activityPublishedAt < cursor[0] ||
    (item.activityPublishedAt === cursor[0] && item.id < cursor[1])
  );
}

function remoteItem(item) {
  return {
    id: `remote:${item.activityId}`,
    source: "remote",
    activityType: item.activityType,
    actorId: item.actorId,
    displayName: item.displayName,
    handle: remoteHandle(item),
    iconUrl: null,
    objectId: item.objectId,
    contentHtml: item.contentHtml,
    url: item.url,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
    activityPublishedAt: item.activityPublishedAt,
    attachments: item.attachments.map((attachment) => ({
      type: attachment.mediaType,
      url: `/api/federation/media/${hash(`${item.objectId}\0${attachment.url}`)}`,
    })),
  };
}

function selfItem(store, config, identity, profile, post) {
  const object = localPostObject(store, config, post);
  return {
    id: `self:${post.id}`,
    source: "self",
    activityType: "Create",
    actorId: `${config.origin}/activitypub/actor`,
    displayName: profile.name,
    handle: `@${identity.username}@${new URL(config.origin).host}`,
    iconUrl: "/activitypub/icon",
    objectId: object.id,
    contentHtml: object.content,
    url: object.url,
    publishedAt: object.published,
    updatedAt: object.updated,
    activityPublishedAt: object.updated || object.published,
    attachments: (object.attachment || []).map((attachment) => {
      const url = new URL(attachment.url);
      return { type: attachment.mediaType, url: url.pathname };
    }),
  };
}

export function ownerFederationTimeline(
  store,
  config,
  cursorValue,
  limit = 30,
) {
  const identity = store.federationIdentity();
  if (!identity) return { items: [], nextCursor: null };
  const profile = store.get("settings", "profile");
  const remote = store.federationTimeline(5_000).map(remoteItem);
  const own = store
    .list("posts")
    .filter((post) => post.federationEnabled === true && post.kind !== "vlog")
    .map((post) => selfItem(store, config, identity, profile, post));
  const cursor = parseCursor(cursorValue);
  const visible = [...remote, ...own]
    .sort(
      (left, right) =>
        right.activityPublishedAt.localeCompare(left.activityPublishedAt) ||
        right.id.localeCompare(left.id),
    )
    .filter((item) => afterCursor(item, cursor));
  const size = Math.max(1, Math.min(50, Number(limit) || 30));
  const items = visible.slice(0, size);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      visible.length > items.length && last
        ? Buffer.from(
            JSON.stringify([last.activityPublishedAt, last.id]),
          ).toString("base64url")
        : null,
  };
}
