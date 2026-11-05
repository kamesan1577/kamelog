import { z } from "zod";
import { StorageError } from "./errors.ts";

export const PUBLIC_METHODS = [
  "list",
  "publicMediaReference",
  "sitemapPosts",
  "get",
  "localPostLikes",
  "save",
  "remove",
  "recordView",
  "autoTagState",
  "replaceAutoTags",
  "inferenceSettings",
  "saveInferenceSettings",
  "hasInferenceCredential",
  "inferenceCredential",
  "saveInferenceCredential",
  "removeInferenceCredential",
  "inferredThreadLink",
  "saveInferredThreadLink",
  "rejectInferredThreadLink",
  "claimInferenceJobs",
  "finishInferenceJob",
  "enqueueInferenceJob",
  "federationIdentity",
  "createFederationIdentity",
  "recordFederationActivity",
  "hasFederationActivity",
  "federationFollowers",
  "federationFollower",
  "saveFederationFollower",
  "removeFederationFollower",
  "federationFollowerInboxes",
  "enqueueFederationActivity",
  "federationOutboundActivity",
  "federationOutboxActivities",
  "saveFederationRemoteActor",
  "federationRemoteActor",
  "saveFederationFollowing",
  "federationFollowing",
  "federationFollowingList",
  "updateFederationFollowingState",
  "removeFederationFollowing",
  "saveFederationRemoteObject",
  "federationRemoteObject",
  "deleteFederationRemoteObject",
  "saveFederationTimelineEntry",
  "federationTimeline",
  "federationLocalPosts",
  "registerFederationRemoteMedia",
  "invalidateFederationRemoteMedia",
  "federationRemoteMedia",
  "federationRemoteMediaIsPublic",
  "cacheFederationRemoteMedia",
  "undoFederationTimelineEntry",
  "canRepostFederationObject",
  "saveFederationRepost",
  "federationRepost",
  "undoFederationRepost",
  "federationPublicReposts",
  "saveFederationRemoteReaction",
  "undoFederationRemoteReaction",
  "federationRemoteReactionCount",
  "claimFederationDelivery",
  "completeFederationDelivery",
  "failFederationDelivery",
  "federationDiagnostics",
  "heartbeatFederationWorker",
  "schemaVersion",
  "credentials",
  "createSession",
  "authenticated",
  "logout",
  "resetAuthentication",
  "challenge",
  "consume",
  "rate",
] as const;
export const READ_METHODS = new Set<string>([
  "list",
  "publicMediaReference",
  "sitemapPosts",
  "get",
  "localPostLikes",
  "autoTagState",
  "inferenceSettings",
  "hasInferenceCredential",
  "inferenceCredential",
  "inferredThreadLink",
  "federationIdentity",
  "hasFederationActivity",
  "federationFollowers",
  "federationFollower",
  "federationFollowerInboxes",
  "federationOutboundActivity",
  "federationOutboxActivities",
  "federationRemoteActor",
  "federationFollowing",
  "federationFollowingList",
  "federationRemoteObject",
  "federationTimeline",
  "federationLocalPosts",
  "federationRemoteMedia",
  "federationRemoteMediaIsPublic",
  "canRepostFederationObject",
  "federationRepost",
  "federationPublicReposts",
  "federationRemoteReactionCount",
  "federationDiagnostics",
  "schemaVersion",
  "credentials",
  "authenticated",
]);
export const generationSchema = z.uuid();
export const selectorSchema = z
  .object({
    version: z.literal(1),
    provider: z.literal("cloudflare"),
    generation: generationSchema,
  })
  .strict();

export function encodeWire(value: unknown): unknown {
  if (value === undefined) return { $storageUndefined: true };
  if (value instanceof Date) return { $storageDate: value.toISOString() };
  if (typeof value === "bigint") return { $storageBigInt: value.toString() };
  if (value instanceof Uint8Array) return { $storageBytes: Array.from(value) };
  if (Array.isArray(value)) return value.map(encodeWire);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, encodeWire(item)]),
    );
  if (typeof value === "function" || typeof value === "symbol")
    throw new StorageError("storage_configuration");
  return value;
}

export function decodeWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeWire);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1) {
      if (object.$storageUndefined === true) return undefined;
      if (typeof object.$storageDate === "string") {
        const date = new Date(object.$storageDate);
        if (!Number.isFinite(date.getTime()))
          throw new StorageError("storage_integrity");
        return date;
      }
      if (typeof object.$storageBigInt === "string")
        return BigInt(object.$storageBigInt);
      if (Array.isArray(object.$storageBytes))
        return Uint8Array.from(
          z.array(z.number().int().min(0).max(255)).parse(object.$storageBytes),
        );
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [key, decodeWire(item)]),
    );
  }
  return value;
}
