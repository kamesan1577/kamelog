import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  postSchema,
  draftSchema,
  profileSchema,
  readBounded,
  extractHashtags,
} from "./validation.mjs";
import { Conflict, SESSION_TTL_SECONDS } from "./store.mjs";
import { convertVideo, saveImage } from "./media.mjs";

export function configuration(env = process.env) {
  const origin = env.KAMELOG_ORIGIN || "http://localhost:3000";
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.username || parsed.password)
    throw new Error("Invalid public origin");
  const secure = parsed.protocol === "https:";
  if (!secure && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    throw new Error("HTTPS is required");
  return {
    origin,
    rpID: parsed.hostname,
    secure,
    bootstrap: env.KAMELOG_BOOTSTRAP_TOKEN || "",
  };
}
const cookie = (name, value, secure, maxAge) =>
  `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
const cookies = (req) =>
  Object.fromEntries(
    (req.headers.get("cookie") || "")
      .split(";")
      .map((v) => v.trim().split("=")),
  );
const equal = (a, b) =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
export function createAPI(store, config) {
  const sessionName = config.secure
    ? "__Host-kamelog-session"
    : "kamelog-session";
  const challengeName = config.secure
    ? "__Host-kamelog-ceremony"
    : "kamelog-ceremony";
  const json = (value, status = 200, headers = {}) =>
    Response.json(value, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    });
  return async function handle(req) {
    try {
      const url = new URL(req.url),
        path = url.pathname.replace(/^\/api\/?/, "").split("/"),
        method = req.method;
      const jar = cookies(req),
        owner = store.authenticated(jar[sessionName]);
      const publicView =
        path[0] === "posts" &&
        Boolean(path[1]) &&
        path[2] === "view" &&
        method === "POST";
      if (method !== "GET" && method !== "HEAD") {
        if (req.headers.get("origin") !== config.origin)
          return json({ error: "Origin rejected" }, 403);
        if (
          !store.rate(
            publicView ? "view-global" : "write-global",
            publicView ? 600 : 120,
          )
        )
          return json({ error: "Try later" }, 429);
      }
      const body = async () => JSON.parse((await readBounded(req)).toString());
      if (path[0] === "health")
        return json({ status: "ok", schema: store.schemaVersion() });
      if (path[0] === "auth") {
        if (path[1] === "session" && method === "GET")
          return json({ authenticated: owner });
        if (path[1] === "logout" && method === "POST") {
          store.logout(jar[sessionName]);
          return json({ ok: true }, 200, {
            "Set-Cookie": cookie(sessionName, "", config.secure, 0),
          });
        }
        if (method !== "POST") return json({ error: "Not found" }, 404);
        if (!store.rate("auth-global", 30))
          return json({ error: "Try later" }, 429);
        const input = await body(),
          credentials = store.credentials();
        if (path[1] === "register" && path[2] === "options") {
          const bootstrap = credentials.length === 0;
          if (
            bootstrap
              ? !(
                  config.bootstrap.length >= 32 &&
                  typeof input.token === "string" &&
                  equal(input.token, config.bootstrap)
                )
              : !owner
          )
            return json({ error: "Unauthorized" }, 401);
          const options = await generateRegistrationOptions({
            rpName: "kamelog",
            rpID: config.rpID,
            userName: "owner",
            userID: Buffer.from("kamelog-owner"),
            attestationType: "none",
            excludeCredentials: credentials.map((c) => ({
              id: c.id,
              transports: c.transports,
            })),
            authenticatorSelection: {
              residentKey: "required",
              userVerification: "required",
            },
          });
          const cid = store.challenge({
            type: "register",
            challenge: options.challenge,
            bootstrap,
          });
          return json(options, 200, {
            "Set-Cookie": cookie(challengeName, cid, config.secure, 300),
          });
        }
        if (path[1] === "login" && path[2] === "options") {
          const options = await generateAuthenticationOptions({
            rpID: config.rpID,
            userVerification: "required",
            allowCredentials: credentials.map((c) => ({
              id: c.id,
              transports: c.transports,
            })),
          });
          const cid = store.challenge({
            type: "login",
            challenge: options.challenge,
          });
          return json(options, 200, {
            "Set-Cookie": cookie(challengeName, cid, config.secure, 300),
          });
        }
        const ceremony = store.consume(jar[challengeName]);
        if (!ceremony || ceremony.type !== path[1])
          return json({ error: "Invalid ceremony" }, 401);
        if (path[1] === "register" && path[2] === "verify") {
          if (ceremony.bootstrap ? credentials.length !== 0 : !owner)
            return json({ error: "Unauthorized" }, 401);
          const result = await verifyRegistrationResponse({
            response: input,
            expectedChallenge: ceremony.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID,
            requireUserVerification: true,
          });
          if (!result.verified || !result.registrationInfo)
            return json({ error: "Authentication failed" }, 401);
          const credential = result.registrationInfo.credential;
          // Recheck after asynchronous crypto: only one first registration may win.
          store.transaction(() => {
            if (ceremony.bootstrap && store.credentials().length)
              throw new Error("Already registered");
            store.save("credentials", credential.id, {
              ...credential,
              publicKey: Buffer.from(credential.publicKey).toString(
                "base64url",
              ),
            });
          });
        } else if (path[1] === "login" && path[2] === "verify") {
          const credential = store.get("credentials", String(input.id));
          if (!credential) return json({ error: "Authentication failed" }, 401);
          const result = await verifyAuthenticationResponse({
            response: input,
            expectedChallenge: ceremony.challenge,
            expectedOrigin: config.origin,
            expectedRPID: config.rpID,
            requireUserVerification: true,
            credential: {
              ...credential,
              publicKey: Buffer.from(credential.publicKey, "base64url"),
            },
          });
          if (!result.verified)
            return json({ error: "Authentication failed" }, 401);
          store.save("credentials", credential.id, {
            ...credential,
            counter: result.authenticationInfo.newCounter,
          });
        } else return json({ error: "Not found" }, 404);
        return json({ authenticated: true }, 200, {
          "Set-Cookie": cookie(
            sessionName,
            store.createSession(),
            config.secure,
            SESSION_TTL_SECONDS,
          ),
        });
      }
      if (path[0] === "posts" && method === "GET") {
        const posts = store.list("posts");
        if (path[1]) {
          const post = posts.find((p) => p.id === path[1]);
          return post ? json(post) : json({ error: "Not found" }, 404);
        }
        const q = (url.searchParams.get("q") || "").slice(0, 200).toLowerCase(),
          kind = url.searchParams.get("kind");
        return json(
          posts
            .filter(
              (p) =>
                (!kind || p.kind === kind) &&
                (!q ||
                  [p.title, p.body, ...p.tags]
                    .join(" ")
                    .toLowerCase()
                    .includes(q)),
            )
            .sort(
              (a, b) =>
                Number(b.pinned) - Number(a.pinned) ||
                b.date.localeCompare(a.date),
            ),
        );
      }
      if (publicView) {
        const post = store.recordView(path[1]);
        return post ? json(post) : json({ error: "Not found" }, 404);
      }
      if (path[0] === "profile" && method === "GET")
        return json(store.get("settings", "profile"));
      if (path[0] === "media" && path[1] && method === "GET") {
        const id = path[1];
        if (!/^[a-f0-9-]{36}$/.test(id))
          return json({ error: "Not found" }, 404);
        const mediaPath = "/api/media/" + id;
        if (
          !owner &&
          !store
            .list("posts")
            .some(
              (p) =>
                p.video === mediaPath ||
                p.images?.includes(mediaPath) ||
                (p.kind === "blog" && p.body.includes(mediaPath)),
            )
        )
          return json({ error: "Not found" }, 404);
        const metadata = store.get("media", id);
        if (!metadata) return json({ error: "Not found" }, 404);
        const bytes = await readFile(
          join(
            store.directory,
            "media",
            id + "." + (metadata.extension || "mp4"),
          ),
        );
        const headers = {
          "Content-Type": metadata.type || "video/mp4",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Accept-Ranges": "bytes",
        };
        const range = req.headers.get("range");
        if (range) {
          const match = /^bytes=(\d+)-(\d*)$/.exec(range);
          if (!match)
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${bytes.length}` },
            });
          const start = Number(match[1]),
            end = match[2] ? Number(match[2]) : bytes.length - 1;
          if (start > end || end >= bytes.length)
            return new Response(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${bytes.length}` },
            });
          return new Response(bytes.subarray(start, end + 1), {
            status: 206,
            headers: {
              ...headers,
              "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
              "Content-Length": String(end - start + 1),
            },
          });
        }
        return new Response(bytes, {
          headers: { ...headers, "Content-Length": String(bytes.length) },
        });
      }
      if (!owner) return json({ error: "Unauthorized" }, 401);
      if (path[0] === "media" && method === "POST")
        return url.searchParams.get("kind") === "image"
          ? json(
              await saveImage(
                store,
                await readBounded(req, 12 * 1024 * 1024),
                req.headers.get("content-type") || "",
              ),
              201,
            )
          : json(
              await convertVideo(
                store,
                await readBounded(req, 64 * 1024 * 1024),
                Number(url.searchParams.get("seconds")),
              ),
              201,
            );
      if (path[0] === "profile" && method === "PUT") {
        const value = profileSchema.parse(await body());
        return json(store.save("settings", "profile", value));
      }
      if (path[0] === "drafts" && method === "GET")
        return json(store.list("drafts"));
      if (["posts", "drafts"].includes(path[0])) {
        const table = path[0];
        if (method === "DELETE") {
          store.remove(table, path[1], Number(req.headers.get("if-match")));
          return json({ ok: true });
        }
        if (method === "POST" || method === "PUT") {
          const input = (table === "posts" ? postSchema : draftSchema).parse(
            await body(),
          );
          const id = method === "POST" ? randomUUID() : path[1];
          if (!id) return json({ error: "Invalid id" }, 400);
          const old = store.get(table, id);
          if (method === "PUT" && !old)
            return json({ error: "Not found" }, 404);
          let parentId = table === "posts" ? input.parentId : undefined;
          if (table === "posts" && method === "PUT") {
            if (
              input.parentId !== undefined &&
              input.parentId !== old?.parentId
            )
              return json({ error: "Thread parent cannot be changed" }, 400);
            parentId = old?.parentId;
          }
          if (parentId) {
            const parent = store.get("posts", parentId);
            if (!parent || parent.kind !== "tweet")
              return json({ error: "Invalid thread parent" }, 400);
          }
          if (input.video && !store.get("media", input.video.split("/").pop()))
            return json({ error: "Unknown media" }, 400);
          if (
            input.images?.some(
              (path) =>
                store.get("media", path.split("/").pop())?.kind !== "image",
            )
          )
            return json({ error: "Unknown image" }, 400);
          const now = new Date().toISOString();
          return json(
            store.save(
              table,
              id,
              {
                ...input,
                ...(table === "posts" && parentId ? { parentId } : {}),
                ...(table === "posts"
                  ? { tags: extractHashtags(input.title, input.body) }
                  : {}),
                ...(table === "posts"
                  ? { date: old?.date || now, likes: old?.likes || 0 }
                  : { savedAt: now }),
              },
              input.revision,
            ),
            method === "POST" ? 201 : 200,
          );
        }
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof Conflict)
        return json(
          { error: "別の操作で変更されました。再読み込みしてください。" },
          409,
        );
      if (error instanceof RangeError)
        return json({ error: "Payload too large" }, 413);
      if (error?.name === "ZodError" || error instanceof SyntaxError)
        return json({ error: "Invalid input" }, 400);
      // No request bodies, tokens or raw exception messages in responses/logs.
      return json(
        { error: "操作に失敗しました。入力を保持して再試行してください。" },
        400,
      );
    }
  };
}
