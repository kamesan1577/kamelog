import { randomUUID } from "node:crypto";
import { ACTIVITY_STREAMS, PUBLIC_AUDIENCE } from "./federation-outbound.mjs";
import { Conflict, hash } from "./store.mjs";

function fallbackActor(actorId) {
  try {
    const url = new URL(actorId);
    const username = decodeURIComponent(
      url.pathname.split("/").filter(Boolean).at(-1) || "remote",
    ).slice(0, 128);
    return {
      displayName: username,
      handle: `@${username}@${url.host}`,
    };
  } catch {
    return { displayName: "Remote author", handle: "@remote" };
  }
}

export function publicFederationReposts(store) {
  return store.federationPublicReposts().map((repost) => {
    const fallback = fallbackActor(repost.actorId);
    return {
      id: `repost:${hash(repost.objectId)}`,
      kind: "repost",
      objectId: repost.objectId,
      displayName: repost.displayName || fallback.displayName,
      handle: repost.handle || fallback.handle,
      contentHtml: repost.contentHtml,
      url: repost.url,
      date: repost.createdAt,
      publishedAt: repost.publishedAt,
      likes: 0,
      attachments: repost.attachments.map((attachment) => ({
        type: attachment.mediaType,
        url: `/api/federation/media/${hash(`${repost.objectId}\0${attachment.url}`)}`,
      })),
    };
  });
}

export function createFederationRepost(
  store,
  config,
  objectId,
  now = new Date(),
) {
  if (typeof objectId !== "string" || objectId.length > 2_048)
    throw new TypeError("Invalid object ID");
  if (!store.federationIdentity()) throw new Conflict("Federation is disabled");
  if (!store.canRepostFederationObject(objectId))
    throw new Conflict("Remote object is unavailable");
  const current = store.federationRepost(objectId);
  if (current && !current.undoneAt) throw new Conflict("Already reposted");
  const actor = `${config.origin}/activitypub/actor`;
  const followers = `${config.origin}/activitypub/followers`;
  const activityId = `${config.origin}/activitypub/activities/announce/${randomUUID()}`;
  const body = {
    "@context": ACTIVITY_STREAMS,
    id: activityId,
    type: "Announce",
    actor,
    object: objectId,
    to: [PUBLIC_AUDIENCE],
    cc: [followers],
  };
  return store.transaction(() => {
    store.saveFederationRepost({
      objectId,
      announceActivityId: activityId,
      createdAt: now.toISOString(),
    });
    store.enqueueFederationActivity(
      {
        id: activityId,
        type: "Announce",
        objectId,
        body,
        createdAt: now.toISOString(),
        nextAttemptAt: now.getTime(),
      },
      store.federationFollowerInboxes(),
    );
    return publicFederationReposts(store).find(
      (repost) => repost.objectId === objectId,
    );
  });
}

export function enqueueFederationRepostUndo(
  store,
  config,
  objectId,
  now = new Date(),
) {
  const repost = store.federationRepost(objectId);
  if (!repost || repost.undoneAt) return false;
  const original = store.federationOutboundActivity(
    repost.announceActivityId,
  )?.body;
  store.undoFederationRepost(objectId, now.toISOString());
  if (!original) return true;
  const actor = `${config.origin}/activitypub/actor`;
  const followers = `${config.origin}/activitypub/followers`;
  const activityId = `${config.origin}/activitypub/activities/undo-announce/${randomUUID()}`;
  store.enqueueFederationActivity(
    {
      id: activityId,
      type: "Undo",
      objectId,
      body: {
        "@context": ACTIVITY_STREAMS,
        id: activityId,
        type: "Undo",
        actor,
        object: original,
        to: [PUBLIC_AUDIENCE],
        cc: [followers],
      },
      createdAt: now.toISOString(),
      nextAttemptAt: now.getTime(),
    },
    store.federationFollowerInboxes(),
  );
  return true;
}

export function undoFederationRepost(
  store,
  config,
  objectId,
  now = new Date(),
) {
  if (typeof objectId !== "string" || objectId.length > 2_048)
    throw new TypeError("Invalid object ID");
  return store.transaction(() => {
    if (!enqueueFederationRepostUndo(store, config, objectId, now))
      throw new Conflict("Not reposted");
    return { ok: true };
  });
}
