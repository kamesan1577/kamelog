import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Conflict, hash, type Store } from "../store.mjs";
import {
  ACTIVITY_STREAMS,
  PUBLIC_AUDIENCE,
  enqueuePostFederationDelete,
  enqueuePostFederationTransition,
  localObjectUrl,
} from "../federation-outbound.mjs";

// These are domain commands, not client-supplied SQL or serialized callbacks.
// Validation and every read/decision/write run at the authoritative database.
const configSchema = z.object({ origin: z.url() });
const objectSchema = z.record(z.string(), z.unknown());
const contentSchema = z.object({
  table: z.enum(["posts", "drafts"]),
  id: z.string().min(1),
  value: objectSchema,
  revision: z.number().int().nonnegative().nullish(),
  config: configSchema,
});
const actorSchema = z
  .object({
    actorId: z.string(),
    inboxUrl: z.string(),
    sharedInboxUrl: z.string().nullable().optional(),
  })
  .passthrough();
const activitySchema = z
  .object({
    id: z.string(),
    type: z.string(),
    object: z.unknown().optional(),
    published: z.string().optional(),
  })
  .passthrough();
const noteSchema = z
  .object({
    objectId: z.string(),
    actorId: z.string(),
    publishedAt: z.string(),
  })
  .passthrough();
const timedObjectSchema = z.object({
  config: configSchema,
  objectId: z.string().max(2048),
  now: z.number().finite(),
});

function objectId(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  )
    return value.id;
}

function objectType(value: unknown): string | undefined {
  if (
    value &&
    typeof value === "object" &&
    "type" in value &&
    typeof value.type === "string"
  )
    return value.type;
}

function enqueueRepostUndo(
  store: Store,
  config: z.infer<typeof configSchema>,
  id: string,
  now: Date,
) {
  const repost = store.federationRepost(id);
  if (!repost || repost.undoneAt) return false;
  const original = store.federationOutboundActivity(
    repost.announceActivityId,
  )?.body;
  store.undoFederationRepost(id, now.toISOString());
  if (!original) return true;
  const activityId = `${config.origin}/activitypub/activities/undo-announce/${randomUUID()}`;
  store.enqueueFederationActivity(
    {
      id: activityId,
      type: "Undo",
      objectId: id,
      body: {
        "@context": ACTIVITY_STREAMS,
        id: activityId,
        type: "Undo",
        actor: `${config.origin}/activitypub/actor`,
        object: original,
        to: [PUBLIC_AUDIENCE],
        cc: [`${config.origin}/activitypub/followers`],
      },
      createdAt: now.toISOString(),
      nextAttemptAt: now.getTime(),
    },
    store.federationFollowerInboxes(),
  );
  return true;
}

const handlers = {
  saveContent(store: Store, args: unknown[]) {
    const [input] = z.tuple([contentSchema]).parse(args);
    return store.save(
      input.table,
      input.id,
      input.value,
      input.revision ?? undefined,
      input.table === "posts"
        ? (saved: Record<string, unknown>, previous: unknown) => {
            enqueuePostFederationTransition(
              store,
              input.config,
              saved,
              previous,
            );
            if (
              store.inferenceSettings()?.autoThreadEnabled &&
              saved.kind === "tweet" &&
              !saved.parentId
            )
              store.enqueueInferenceJob({
                task: "thread",
                postId: saved.id,
                inputHash: createHash("sha256")
                  .update(`${saved.id}:${saved.revision}`)
                  .digest("hex"),
                engineId: "jev-thread-v1",
              });
          }
        : undefined,
    );
  },
  removeContent(store: Store, args: unknown[]) {
    const [input] = z.tuple([contentSchema.omit({ value: true })]).parse(args);
    store.remove(
      input.table,
      input.id,
      input.revision ?? undefined,
      input.table === "posts"
        ? (post: unknown) =>
            enqueuePostFederationDelete(store, input.config, post)
        : undefined,
    );
    return null;
  },
  registerCredential(store: Store, args: unknown[]) {
    const [input] = z
      .tuple([
        z.object({
          bootstrap: z.boolean(),
          credential: z.object({ id: z.string() }).passthrough(),
        }),
      ])
      .parse(args);
    return store.transaction(() => {
      if (input.bootstrap && store.credentials().length)
        throw new Conflict("Already registered");
      store.save("credentials", input.credential.id, input.credential);
      return null;
    });
  },
  localLike(store: Store, args: unknown[]) {
    const [postId, input] = z
      .tuple([
        z.string(),
        z.object({ clientId: z.uuid(), liked: z.boolean() }).strict(),
      ])
      .parse(args);
    const clientHash = hash(`${postId}:${input.clientId.toLowerCase()}`);
    return store.transaction(() => {
      if (!store.get("posts", postId)) return null;
      const result = input.liked
        ? store.db
            .prepare(
              "INSERT OR IGNORE INTO local_post_likes(post_id, client_hash) VALUES(?, ?)",
            )
            .run(postId, clientHash)
        : store.db
            .prepare(
              "DELETE FROM local_post_likes WHERE post_id=? AND client_hash=?",
            )
            .run(postId, clientHash);
      if (result.changes)
        store.db
          .prepare(
            `UPDATE posts SET data=json_set(data, '$.likes',
        MAX(0, COALESCE(json_extract(data, '$.likes'), 0) + ?)) WHERE id=?`,
          )
          .run(input.liked ? 1 : -1, postId);
      return store.get("posts", postId);
    });
  },
  manualTags(store: Store, args: unknown[]) {
    z.tuple([]).parse(args);
    return store.db
      .prepare(
        "SELECT post_id, tag FROM post_tags WHERE source='manual' ORDER BY tag",
      )
      .all();
  },
  replaceTags(store: Store, args: unknown[]) {
    const [postId, tags, run] = z
      .tuple([
        z.string(),
        z.array(z.object({ tag: z.string() })),
        z.object({
          contentHash: z.string(),
          manualTags: z.array(z.string()),
          requireEnabled: z.boolean().optional(),
          modelVersion: z.string(),
          trainingHash: z.string(),
          engineId: z.string(),
          providerId: z.string(),
          adapterVersion: z.string(),
          candidateHash: z.string(),
        }),
      ])
      .parse(args);
    return store.transaction(() => {
      const row = store.db
        .prepare("SELECT data FROM posts WHERE id=?")
        .get(postId);
      if (!row) return false;
      const post = JSON.parse(String(row.data));
      if (hash(`${post.title || ""}\n${post.body || ""}`) !== run.contentHash)
        return false;
      const manual = store.db
        .prepare(
          "SELECT tag FROM post_tags WHERE post_id=? AND source='manual' ORDER BY tag",
        )
        .all(postId)
        .map(({ tag }) => tag);
      if (JSON.stringify(manual) !== JSON.stringify([...run.manualTags].sort()))
        return false;
      if (run.requireEnabled && !store.inferenceSettings()?.autoTagEnabled)
        return false;
      store.db
        .prepare("DELETE FROM post_tags WHERE post_id=? AND source='auto'")
        .run(postId);
      const insert = store.db.prepare(`INSERT INTO post_tags
        (post_id, tag, source, confidence, model_version, content_hash, training_hash)
        VALUES (?, ?, 'auto', NULL, ?, ?, ?)`);
      for (const { tag } of tags)
        if (!manual.includes(tag))
          insert.run(
            postId,
            tag,
            run.modelVersion,
            run.contentHash,
            run.trainingHash,
          );
      store.db
        .prepare(
          `INSERT INTO post_tag_runs(post_id, content_hash, model_version, training_hash)
        VALUES (?, ?, ?, ?) ON CONFLICT(post_id) DO UPDATE SET
        content_hash=excluded.content_hash, model_version=excluded.model_version, training_hash=excluded.training_hash`,
        )
        .run(postId, run.contentHash, run.modelVersion, run.trainingHash);
      store.db
        .prepare(
          `INSERT INTO inference_runs
        (id, task, post_id, engine_id, provider_id, model_version, adapter_version, input_hash, candidate_hash, usage, executed_at)
        VALUES (?, 'tag', ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
        )
        .run(
          randomUUID(),
          postId,
          run.engineId,
          run.providerId,
          run.modelVersion,
          run.adapterVersion,
          run.contentHash,
          run.candidateHash,
          new Date().toISOString(),
        );
      return true;
    });
  },
  updateNotificationSettings(store: Store, args: unknown[]) {
    const [input] = z
      .tuple([
        z.object({
          settings: objectSchema,
          credential: objectSchema.nullable(),
          removeCredential: z.boolean(),
        }),
      ])
      .parse(args);
    return store.transaction(() => {
      if (input.removeCredential)
        store.remove("settings", "notifications:webhook");
      if (input.credential)
        store.save("settings", "notifications:webhook", input.credential);
      store.save("settings", "notifications", input.settings);
      return null;
    });
  },
  followActor(store: Store, args: unknown[]) {
    const [input] = z
      .tuple([
        z.object({ config: configSchema, actor: actorSchema, now: z.number() }),
      ])
      .parse(args);
    return store.transaction(() => {
      if (!store.federationIdentity())
        throw new Conflict("Federation is disabled");
      const { actor, config } = input;
      if (store.federationFollowing(actor.actorId))
        throw new Conflict("Already following");
      const now = new Date(input.now);
      const activityId = `${config.origin}/activitypub/activities/follow/${randomUUID()}`;
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
          body: {
            "@context": ACTIVITY_STREAMS,
            id: activityId,
            type: "Follow",
            actor: `${config.origin}/activitypub/actor`,
            object: actor.actorId,
            to: [actor.actorId],
          },
          createdAt: now.toISOString(),
          nextAttemptAt: now.getTime(),
        },
        [actor.sharedInboxUrl || actor.inboxUrl],
      );
      return following;
    });
  },
  unfollowActor(store: Store, args: unknown[]) {
    const [input] = z
      .tuple([
        z.object({
          config: configSchema,
          actorId: z.string(),
          now: z.number(),
        }),
      ])
      .parse(args);
    return store.transaction(() => {
      const following = store.federationFollowing(input.actorId);
      const actor = store.federationRemoteActor(input.actorId);
      if (!following || !actor) throw new Conflict("Not following");
      const original = store.federationOutboundActivity(
        following.followActivityId,
      )?.body;
      if (!original) throw new Conflict("Follow activity is unavailable");
      const now = new Date(input.now);
      const activityId = `${input.config.origin}/activitypub/activities/undo-follow/${randomUUID()}`;
      store.enqueueFederationActivity(
        {
          id: activityId,
          type: "Undo",
          objectId: following.followActivityId,
          body: {
            "@context": ACTIVITY_STREAMS,
            id: activityId,
            type: "Undo",
            actor: `${input.config.origin}/activitypub/actor`,
            object: original,
            to: [actor.actorId],
          },
          createdAt: now.toISOString(),
          nextAttemptAt: now.getTime(),
        },
        [actor.sharedInboxUrl || actor.inboxUrl],
      );
      store.removeFederationFollowing(input.actorId);
      return { ok: true };
    });
  },
  createRepost(store: Store, args: unknown[]) {
    const [input] = z.tuple([timedObjectSchema]).parse(args);
    return store.transaction(() => {
      if (!store.federationIdentity())
        throw new Conflict("Federation is disabled");
      if (!store.canRepostFederationObject(input.objectId))
        throw new Conflict("Remote object is unavailable");
      const current = store.federationRepost(input.objectId);
      if (current && !current.undoneAt) throw new Conflict("Already reposted");
      const now = new Date(input.now);
      const activityId = `${input.config.origin}/activitypub/activities/announce/${randomUUID()}`;
      store.saveFederationRepost({
        objectId: input.objectId,
        announceActivityId: activityId,
        createdAt: now.toISOString(),
      });
      store.enqueueFederationActivity(
        {
          id: activityId,
          type: "Announce",
          objectId: input.objectId,
          body: {
            "@context": ACTIVITY_STREAMS,
            id: activityId,
            type: "Announce",
            actor: `${input.config.origin}/activitypub/actor`,
            object: input.objectId,
            to: [PUBLIC_AUDIENCE],
            cc: [`${input.config.origin}/activitypub/followers`],
          },
          createdAt: now.toISOString(),
          nextAttemptAt: now.getTime(),
        },
        store.federationFollowerInboxes(),
      );
      return null;
    });
  },
  undoRepost(store: Store, args: unknown[]) {
    const [input] = z.tuple([timedObjectSchema]).parse(args);
    return store.transaction(() => {
      if (
        !enqueueRepostUndo(
          store,
          input.config,
          input.objectId,
          new Date(input.now),
        )
      )
        throw new Conflict("Not reposted");
      return { ok: true };
    });
  },
  receiveFollow(store: Store, args: unknown[]) {
    const [input] = z
      .tuple([
        z.object({
          config: configSchema,
          activity: activitySchema,
          actorId: z.string(),
          inboxUrl: z.string(),
          sharedInboxUrl: z.string().nullable(),
          receivedAt: z.string(),
        }),
      ])
      .parse(args);
    return store.transaction(() => {
      const {
        activity,
        actorId,
        inboxUrl,
        sharedInboxUrl,
        receivedAt,
        config,
      } = input;
      if (
        !store.recordFederationActivity({
          id: activity.id,
          actorId,
          type: activity.type,
          receivedAt,
        })
      )
        return null;
      store.saveFederationFollower({
        actorId,
        inboxUrl,
        sharedInboxUrl,
        followActivityId: activity.id,
        followedAt: receivedAt,
      });
      const acceptId = `${config.origin}/activitypub/activities/accept/${hash(activity.id)}`;
      store.enqueueFederationActivity(
        {
          id: acceptId,
          type: "Accept",
          objectId: activity.id,
          createdAt: receivedAt,
          nextAttemptAt: Date.parse(receivedAt),
          body: {
            "@context": ACTIVITY_STREAMS,
            id: acceptId,
            type: "Accept",
            actor: `${config.origin}/activitypub/actor`,
            object: activity,
            to: [actorId],
          },
        },
        [sharedInboxUrl || inboxUrl],
      );
      return null;
    });
  },
  receiveRemoteActivity(store: Store, args: unknown[]) {
    const [input] = z
      .tuple([
        z.object({
          activity: activitySchema,
          actor: actorSchema,
          note: noteSchema.nullable(),
          receivedAt: z.string(),
          config: configSchema.nullable(),
          deleteObjectId: z.string().nullable(),
        }),
      ])
      .parse(args);
    return store.transaction(() => {
      const { activity, actor, note, receivedAt, config } = input;
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
        const followId = objectId(activity.object);
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
        const id = objectId(activity.object);
        if (id) {
          store.undoFederationRemoteReaction(id, actor.actorId, receivedAt);
          if (
            typeof activity.object === "string" ||
            objectType(activity.object) === "Follow"
          )
            store.removeFederationFollower(actor.actorId, id);
          if (
            typeof activity.object === "string" ||
            objectType(activity.object) === "Announce"
          )
            store.undoFederationTimelineEntry(id, actor.actorId, receivedAt);
        }
        return true;
      }
      if (["Like", "EmojiReact"].includes(activity.type)) {
        const id = objectId(activity.object);
        const prefix = config ? `${config.origin}/activitypub/objects/` : null;
        if (config && id && prefix && id.startsWith(prefix)) {
          let postId: string | undefined;
          try {
            postId = decodeURIComponent(id.slice(prefix.length));
          } catch {
            /* Invalid identifier. */
          }
          const post = postId ? store.get("posts", postId) : null;
          if (post?.federationEnabled && localObjectUrl(config, postId) === id)
            store.saveFederationRemoteReaction({
              postId: post.id,
              actorId: actor.actorId,
              activityId: activity.id,
              type: activity.type,
              reactedAt: receivedAt,
            });
        }
        return true;
      }
      if (
        store.federationFollowing(actor.actorId)?.state !== "accepted" &&
        activity.type !== "Delete"
      )
        return true;
      if (activity.type === "Create" && note) {
        if (
          note.actorId !== actor.actorId ||
          !store.saveFederationRemoteObject(note)
        )
          return true;
        store.saveFederationTimelineEntry({
          activityId: activity.id,
          actorId: actor.actorId,
          type: "Create",
          objectId: note.objectId,
          publishedAt: note.publishedAt,
          receivedAt,
        });
      } else if (activity.type === "Update" && note) {
        const existing = z
          .object({ actorId: z.string() })
          .nullable()
          .parse(store.federationRemoteObject(note.objectId) ?? null);
        if (
          existing?.actorId === actor.actorId &&
          note.actorId === actor.actorId
        )
          store.saveFederationRemoteObject(note);
      } else if (activity.type === "Delete") {
        const id = objectId(activity.object);
        if (
          id &&
          store.undoFederationRemoteReaction(id, actor.actorId, receivedAt)
        )
          return true;
        const normalizedId = input.deleteObjectId;
        if (normalizedId) {
          const existing = z
            .object({ actorId: z.string() })
            .nullable()
            .parse(store.federationRemoteObject(normalizedId) ?? null);
          if (
            existing?.actorId === actor.actorId &&
            store.federationRepost(normalizedId)
          ) {
            if (config)
              enqueueRepostUndo(
                store,
                config,
                normalizedId,
                new Date(receivedAt),
              );
            else store.undoFederationRepost(normalizedId, receivedAt);
          }
          if (existing?.actorId === actor.actorId)
            store.deleteFederationRemoteObject(
              normalizedId,
              actor.actorId,
              receivedAt,
            );
        }
      } else if (activity.type === "Announce" && note) {
        if (!store.saveFederationRemoteObject(note)) return true;
        store.saveFederationTimelineEntry({
          activityId: activity.id,
          actorId: actor.actorId,
          type: "Announce",
          objectId: note.objectId,
          publishedAt: new Date(
            Number.isFinite(Date.parse(activity.published || ""))
              ? Date.parse(activity.published!)
              : Date.parse(note.publishedAt),
          ).toISOString(),
          receivedAt,
        });
      }
      return true;
    });
  },
  recoverThreadJobs(store: Store, args: unknown[]) {
    const [now] = z.tuple([z.number().finite()]).parse(args);
    return Number(
      store.db
        .prepare(
          `UPDATE inference_jobs
      SET state='retry', next_attempt_at=?, last_error_code='interrupted', updated_at=?, completed_at=NULL
      WHERE task='thread' AND state='processing' AND updated_at<?`,
        )
        .run(
          now,
          new Date(now).toISOString(),
          new Date(now - 10 * 60_000).toISOString(),
        ).changes,
    );
  },
};

export type StorageCommandName = keyof typeof handlers;
export const storageCommandNames = Object.freeze(Object.keys(handlers));
export const readOnlyStorageCommands = new Set<string>(["manualTags"]);

export function dispatchStorageCommand(
  store: Store,
  name: string,
  args: unknown[],
): unknown {
  if (!Object.hasOwn(handlers, name))
    throw new TypeError("Unknown storage command");
  return handlers[name as StorageCommandName](store, args);
}

export function executeCommand<Name extends StorageCommandName>(
  store: Store & { command?: (name: string, args: unknown[]) => unknown },
  name: Name,
  args: unknown[],
): ReturnType<(typeof handlers)[Name]> {
  const result =
    typeof store.command === "function"
      ? store.command(name, args)
      : dispatchStorageCommand(store, name, args);
  return result as ReturnType<(typeof handlers)[Name]>;
}
