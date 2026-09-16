import { randomUUID } from "node:crypto";
import { Conflict } from "./store.mjs";
import {
  fetchFederationJson,
  normalizeFederationUrl,
} from "./federation-fetch.mjs";
import { ACTIVITY_STREAMS, PUBLIC_AUDIENCE } from "./federation-outbound.mjs";
import { sanitizeRemoteHtml } from "./federation-content.mjs";
import { enqueueFederationRepostUndo } from "./federation-reposts.mjs";

const ACTOR_TYPES = new Set([
  "Person",
  "Service",
  "Application",
  "Organization",
  "Group",
]);
const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export class InvalidFederationHandle extends TypeError {}

function cleanText(value, limit) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function normalizedUrl(value, options) {
  if (typeof value !== "string" || value.length > 2_048)
    throw new Error("invalid remote URL");
  return normalizeFederationUrl(value, options).toString();
}

function optionalUrl(value, options) {
  try {
    return value ? normalizedUrl(value, options) : null;
  } catch {
    return null;
  }
}

export function normalizeRemoteActor(
  actor,
  { handle = null, fetchOptions, now = new Date() } = {},
) {
  if (!actor || !ACTOR_TYPES.has(actor.type))
    throw new Error("unsupported remote actor");
  const actorId = normalizedUrl(actor.id, fetchOptions);
  const inboxUrl = normalizedUrl(actor.inbox, fetchOptions);
  const sharedInboxUrl = optionalUrl(
    actor.endpoints?.sharedInbox,
    fetchOptions,
  );
  const preferredUsername = cleanText(actor.preferredUsername, 128);
  if (!preferredUsername) throw new Error("remote actor has no username");
  const iconValue =
    typeof actor.icon === "string" ? actor.icon : actor.icon?.url;
  return {
    actorId,
    handle,
    inboxUrl,
    sharedInboxUrl,
    preferredUsername,
    displayName: cleanText(actor.name, 200) || preferredUsername,
    iconUrl: optionalUrl(iconValue, fetchOptions),
    fetchedAt: now.toISOString(),
  };
}

function parseHandle(value) {
  const match = /^@?([^@\s]{1,128})@([^@\s]{1,253})$/.exec(
    String(value || "").trim(),
  );
  if (!match) throw new InvalidFederationHandle("invalid Fediverse handle");
  const [, username, domain] = match;
  const base = new URL(`https://${domain}/`);
  if (
    base.pathname !== "/" ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  )
    throw new InvalidFederationHandle("invalid Fediverse handle");
  normalizeFederationUrl(base, {});
  return {
    username,
    domain: base.host.toLowerCase(),
    handle: `@${username}@${base.host.toLowerCase()}`,
  };
}

export async function resolveRemoteHandle(value, options = {}) {
  const parsed = parseHandle(value);
  const fetchJson = options.fetchJson || fetchFederationJson;
  const resource = `acct:${parsed.username}@${parsed.domain}`;
  const webfinger = new URL(
    "/.well-known/webfinger",
    `https://${parsed.domain}`,
  );
  webfinger.searchParams.set("resource", resource);
  const { value: document } = await fetchJson(webfinger, options.fetchOptions);
  const link = document?.links?.find(
    (candidate) =>
      candidate?.rel === "self" &&
      typeof candidate.href === "string" &&
      ["application/activity+json", "application/ld+json"].some((type) =>
        String(candidate.type || "").includes(type),
      ),
  );
  if (!link) throw new InvalidFederationHandle("Actor was not found");
  const actorUrl = normalizedUrl(link.href, options.fetchOptions);
  const { value: actor } = await fetchJson(actorUrl, options.fetchOptions);
  const normalized = normalizeRemoteActor(actor, {
    handle: parsed.handle,
    fetchOptions: options.fetchOptions,
    now: options.now,
  });
  if (normalized.actorId !== actorUrl)
    throw new InvalidFederationHandle("Actor identifier did not match");
  return normalized;
}

export async function followRemoteActor(store, config, handle, options = {}) {
  if (!store.federationIdentity()) throw new Conflict("Federation is disabled");
  const actor = await resolveRemoteHandle(handle, options);
  if (store.federationFollowing(actor.actorId))
    throw new Conflict("Already following");
  const now = options.now || new Date();
  const localActor = `${config.origin}/activitypub/actor`;
  const activityId = `${config.origin}/activitypub/activities/follow/${randomUUID()}`;
  const body = {
    "@context": ACTIVITY_STREAMS,
    id: activityId,
    type: "Follow",
    actor: localActor,
    object: actor.actorId,
    to: [actor.actorId],
  };
  return store.transaction(() => {
    store.saveFederationRemoteActor(actor);
    const following = store.saveFederationFollowing({
      actorId: actor.actorId,
      state: "pending",
      followActivityId: activityId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    store.enqueueFederationActivity(
      {
        id: activityId,
        type: "Follow",
        objectId: actor.actorId,
        body,
        createdAt: now.toISOString(),
        nextAttemptAt: now.getTime(),
      },
      [actor.sharedInboxUrl || actor.inboxUrl],
    );
    return following;
  });
}

export function unfollowRemoteActor(store, config, actorId, now = new Date()) {
  const following = store.federationFollowing(actorId);
  const actor = store.federationRemoteActor(actorId);
  if (!following || !actor) throw new Conflict("Not following");
  const original = store.federationOutboundActivity(
    following.followActivityId,
  )?.body;
  if (!original) throw new Conflict("Follow activity is unavailable");
  const localActor = `${config.origin}/activitypub/actor`;
  const activityId = `${config.origin}/activitypub/activities/undo-follow/${randomUUID()}`;
  const body = {
    "@context": ACTIVITY_STREAMS,
    id: activityId,
    type: "Undo",
    actor: localActor,
    object: original,
    to: [actor.actorId],
  };
  return store.transaction(() => {
    store.enqueueFederationActivity(
      {
        id: activityId,
        type: "Undo",
        objectId: following.followActivityId,
        body,
        createdAt: now.toISOString(),
        nextAttemptAt: now.getTime(),
      },
      [actor.sharedInboxUrl || actor.inboxUrl],
    );
    store.removeFederationFollowing(actorId);
    return { ok: true };
  });
}

function activityObjectId(value) {
  return typeof value === "string" ? value : value?.id;
}

function publicObject(object) {
  const audience = [
    ...(Array.isArray(object?.to) ? object.to : [object?.to]),
    ...(Array.isArray(object?.cc) ? object.cc : [object?.cc]),
  ];
  return audience.includes(PUBLIC_AUDIENCE);
}

function normalizeRemoteNote(object, receivedAt, options = {}) {
  if (!object || object.type !== "Note" || !publicObject(object))
    throw new Error("unsupported remote object");
  const objectId = normalizedUrl(object.id, options.fetchOptions);
  const actorId = normalizedUrl(
    typeof object.attributedTo === "string"
      ? object.attributedTo
      : object.attributedTo?.id,
    options.fetchOptions,
  );
  const content = String(object.content || "");
  if (content.length > 100_000) throw new Error("remote content is too large");
  const originalUrl = optionalUrl(
    typeof object.url === "string" ? object.url : object.url?.href,
    options.fetchOptions,
  );
  const date = (value, fallback) => {
    const parsed = Date.parse(value || "");
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
  };
  const publishedAt = date(object.published, receivedAt);
  const attachments = (
    Array.isArray(object.attachment)
      ? object.attachment
      : object.attachment
        ? [object.attachment]
        : []
  ).flatMap((attachment) => {
    const mediaType = String(attachment?.mediaType || "").toLowerCase();
    const url = optionalUrl(
      typeof attachment?.url === "string"
        ? attachment.url
        : attachment?.url?.href,
      options.fetchOptions,
    );
    return url && IMAGE_TYPES.has(mediaType)
      ? [{ type: "Image", mediaType, url }]
      : [];
  });
  return {
    objectId,
    actorId,
    type: "Note",
    contentHtml: sanitizeRemoteHtml(content),
    url: originalUrl || objectId,
    publishedAt,
    updatedAt: date(object.updated, publishedAt),
    attachments: attachments.slice(0, 4),
    receivedAt,
  };
}

function followed(store, actorId) {
  return store.federationFollowing(actorId)?.state === "accepted";
}

export async function processIncomingRemoteActivity(
  store,
  activity,
  actorDocument,
  options = {},
) {
  if (store.hasFederationActivity(activity.id)) return false;
  const now = options.now || new Date();
  const receivedAt = now.toISOString();
  const actor = normalizeRemoteActor(actorDocument, {
    fetchOptions: options.fetchOptions,
    now,
  });
  const acceptsPosts = followed(store, actor.actorId);
  let note = null;
  if (
    acceptsPosts &&
    (activity.type === "Create" || activity.type === "Update")
  )
    note = normalizeRemoteNote(activity.object, receivedAt, options);
  if (acceptsPosts && activity.type === "Announce") {
    const fetchJson = options.fetchJson || fetchFederationJson;
    const object =
      typeof activity.object === "string"
        ? (await fetchJson(activity.object, options.fetchOptions)).value
        : activity.object;
    note = normalizeRemoteNote(object, receivedAt, options);
  }
  return store.transaction(() => {
    if (
      !store.recordFederationActivity({
        id: activity.id,
        actorId: actor.actorId,
        type: activity.type.slice(0, 80),
        receivedAt,
      })
    )
      return false;
    store.saveFederationRemoteActor(actor);
    if (activity.type === "Accept" || activity.type === "Reject") {
      const followId = activityObjectId(activity.object);
      if (followId)
        store.updateFederationFollowingState(
          actor.actorId,
          followId,
          activity.type === "Accept" ? "accepted" : "rejected",
          receivedAt,
        );
      return true;
    }
    if (activity.type === "Undo") {
      const undone = activity.object;
      const undoneId = activityObjectId(undone);
      if (undoneId && (typeof undone === "string" || undone?.type === "Follow"))
        store.removeFederationFollower(actor.actorId, undoneId);
      if (
        undoneId &&
        (typeof undone === "string" || undone?.type === "Announce")
      )
        store.undoFederationTimelineEntry(undoneId, actor.actorId, receivedAt);
      return true;
    }
    if (!followed(store, actor.actorId) && activity.type !== "Delete")
      return true;
    if (activity.type === "Create" && note) {
      if (note.actorId !== actor.actorId) return true;
      if (!store.saveFederationRemoteObject(note)) return true;
      store.saveFederationTimelineEntry({
        activityId: activity.id,
        actorId: actor.actorId,
        type: "Create",
        objectId: note.objectId,
        publishedAt: note.publishedAt,
        receivedAt,
      });
      return true;
    }
    if (activity.type === "Update" && note) {
      const existing = store.federationRemoteObject(note.objectId);
      if (existing?.actorId === actor.actorId && note.actorId === actor.actorId)
        store.saveFederationRemoteObject(note);
      return true;
    }
    if (activity.type === "Delete") {
      const objectId = activityObjectId(activity.object);
      if (objectId) {
        const normalizedObjectId = normalizedUrl(
          objectId,
          options.fetchOptions,
        );
        const existing = store.federationRemoteObject(normalizedObjectId);
        if (
          existing?.actorId === actor.actorId &&
          store.federationRepost(normalizedObjectId)
        ) {
          if (options.config)
            enqueueFederationRepostUndo(
              store,
              options.config,
              normalizedObjectId,
              now,
            );
          else store.undoFederationRepost(normalizedObjectId, receivedAt);
        }
        if (existing?.actorId === actor.actorId)
          store.deleteFederationRemoteObject(
            normalizedObjectId,
            actor.actorId,
            receivedAt,
          );
      }
      return true;
    }
    if (activity.type === "Announce" && note) {
      if (!store.saveFederationRemoteObject(note)) return true;
      store.saveFederationTimelineEntry({
        activityId: activity.id,
        actorId: actor.actorId,
        type: "Announce",
        objectId: note.objectId,
        publishedAt: new Date(
          Number.isFinite(Date.parse(activity.published || ""))
            ? Date.parse(activity.published)
            : Date.parse(note.publishedAt),
        ).toISOString(),
        receivedAt,
      });
      return true;
    }
    return true;
  });
}
