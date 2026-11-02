import { executeCommand } from "./storage/commands.ts";
import { hash } from "./store.mjs";

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
  executeCommand(store, "createRepost", [
    {
      config: { origin: config.origin },
      objectId,
      now: now.getTime(),
    },
  ]);
  return publicFederationReposts(store).find(
    (repost) => repost.objectId === objectId,
  );
}

export function undoFederationRepost(
  store,
  config,
  objectId,
  now = new Date(),
) {
  return executeCommand(store, "undoRepost", [
    {
      config: { origin: config.origin },
      objectId,
      now: now.getTime(),
    },
  ]);
}
