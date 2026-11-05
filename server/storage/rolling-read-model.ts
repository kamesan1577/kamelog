import { z } from "zod";
import { StorageError } from "./errors.ts";

type Call = (method: string, args: unknown[]) => unknown;
const cursorSchema = z.tuple([z.string(), z.string()]).nullable();
const legacyPostSchema = z
  .object({
    id: z.string(),
    kind: z.string().optional(),
    body: z.string().optional(),
    video: z.string().optional(),
    images: z.array(z.string()).optional(),
    date: z.string().optional(),
    updatedAt: z.string().optional(),
    federationUpdatedAt: z.string().optional(),
    federationEnabled: z.boolean().optional(),
  })
  .passthrough();
const remotePageSchema = z.array(
  z
    .object({ activityId: z.string(), activityPublishedAt: z.string() })
    .passthrough(),
);

/** Keep schema-12 Workers usable during a rolling app/Worker update.
 * Once version 13 is observed, every new operation uses its indexed RPC directly.
 * Never fall back after a failed RPC: quotas, fences and unknown writes propagate.
 */
export function rollingReadModelCall(raw: Call, now = Date.now): Call {
  let version: 12 | 13 | undefined;
  let recheckAt = 0;
  const observe = (value: unknown) => {
    const parsed = z.union([z.literal(12), z.literal(13)]).safeParse(value);
    if (!parsed.success) throw new StorageError("storage_integrity");
    version = parsed.data;
    recheckAt = now() + 300_000;
    return version;
  };
  const supportsReadModel = () => {
    if (version === undefined || (version === 12 && now() >= recheckAt))
      observe(raw("schemaVersion", []));
    return version === 13;
  };
  const posts = () => z.array(legacyPostSchema).parse(raw("list", ["posts"]));
  return (method, args) => {
    if (method === "schemaVersion") return observe(raw(method, args));
    const poll = method === "$command" && args[0] === "pollFederation";
    const remoteCursor = method === "federationTimeline" && args[1] != null;
    if (
      ![
        "publicMediaReference",
        "sitemapPosts",
        "federationLocalPosts",
      ].includes(method) &&
      !poll &&
      !remoteCursor
    )
      return raw(method, args);
    if (supportsReadModel()) return raw(method, args);
    if (method === "publicMediaReference") {
      const [id] = z.tuple([z.string().regex(/^[a-f0-9-]{36}$/)]).parse(args);
      const path = `/api/media/${id}`;
      return posts().some(
        (post) =>
          post.video === path ||
          post.images?.includes(path) ||
          (post.kind === "blog" && post.body?.includes(path)),
      );
    }
    if (method === "sitemapPosts")
      return posts()
        .filter((post) => post.kind === "blog")
        .map((post) => ({
          id: post.id,
          ...(post.date ? { date: post.date } : {}),
          ...(post.updatedAt ? { updatedAt: post.updatedAt } : {}),
        }));
    if (method === "federationLocalPosts") {
      const [cursor, limit] = z
        .tuple([cursorSchema, z.number().int().min(1).max(51)])
        .parse(args);
      const date = (post: z.infer<typeof legacyPostSchema>) =>
        post.federationUpdatedAt || post.updatedAt || post.date || "";
      return posts()
        .filter((post) => post.federationEnabled && post.kind !== "vlog")
        .filter(
          (post) =>
            !cursor ||
            date(post) < cursor[0] ||
            (date(post) === cursor[0] && `self:${post.id}` < cursor[1]),
        )
        .sort(
          (a, b) => date(b).localeCompare(date(a)) || b.id.localeCompare(a.id),
        )
        .slice(0, limit);
    }
    if (remoteCursor) {
      const [limit, cursor] = z
        .tuple([z.number().int().min(1).max(51), cursorSchema])
        .parse(args);
      return remotePageSchema
        .parse(raw("federationTimeline", [5000]))
        .filter(
          (item) =>
            !cursor ||
            item.activityPublishedAt < cursor[0] ||
            (item.activityPublishedAt === cursor[0] &&
              `remote:${item.activityId}` < cursor[1]),
        )
        .slice(0, limit);
    }
    const [, [time]] = z
      .tuple([z.literal("pollFederation"), z.tuple([z.number().finite()])])
      .parse(args);
    raw("heartbeatFederationWorker", [new Date(time)]);
    const delivery = raw("claimFederationDelivery", [time]);
    return {
      delivery,
      identity: delivery ? raw("federationIdentity", []) : null,
    };
  };
}
