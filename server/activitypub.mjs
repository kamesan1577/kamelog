import {
  createHash,
  createSign,
  createVerify,
  generateKeyPairSync,
  timingSafeEqual,
} from "node:crypto";
import sanitizeHtml from "sanitize-html";
import {
  fetchFederationJson,
  normalizeFederationUrl,
} from "./federation-fetch.mjs";
import { ACTIVITY_STREAMS, localPostObject } from "./federation-outbound.mjs";
import { readBounded } from "./validation.mjs";

const ACTIVITY_CONTENT_TYPE =
  'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const USERNAME_PATTERN = /^[a-z0-9_]{1,64}$/;
const RESERVED_USERNAMES = new Set([
  "activitypub",
  "admin",
  "api",
  "federation",
  "inbox",
  "outbox",
  "root",
  "system",
  "www",
]);

export class InvalidFederationUsername extends TypeError {}

const jsonResponse = (
  value,
  status = 200,
  contentType = ACTIVITY_CONTENT_TYPE,
) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    },
  });

const notFound = () =>
  jsonResponse({ error: "Not found" }, 404, "application/json");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function validateFederationUsername(value) {
  const username = String(value || "")
    .trim()
    .toLowerCase();
  if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username))
    throw new InvalidFederationUsername("Invalid federation username");
  return username;
}

export function createFederationIdentity(store, username, now = new Date()) {
  const normalized = validateFederationUsername(username);
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return store.createFederationIdentity({
    username: normalized,
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    createdAt: now.toISOString(),
  });
}

export function federationStatus(store, config) {
  const identity = store.federationIdentity();
  const host = new URL(config.origin).host;
  if (!identity) return { enabled: false, host };
  return {
    enabled: true,
    username: identity.username,
    host,
    handle: `@${identity.username}@${host}`,
    actorUrl: `${config.origin}/activitypub/actor`,
    ...store.federationDiagnostics(),
  };
}

export function sanitizeRemoteHtml(value) {
  return sanitizeHtml(String(value || ""), {
    allowedTags: [
      "p",
      "br",
      "a",
      "span",
      "strong",
      "em",
      "code",
      "pre",
      "blockquote",
      "ul",
      "ol",
      "li",
    ],
    allowedAttributes: { a: ["href", "rel"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          href: attributes.href || "",
          rel: "nofollow noopener noreferrer",
        },
      }),
    },
    disallowedTagsMode: "discard",
  });
}

function actorDocument(store, config, identity) {
  const profile = store.get("settings", "profile");
  const actor = `${config.origin}/activitypub/actor`;
  const iconType = /^data:image\/(png|jpeg|webp);base64,/.exec(
    profile.icon,
  )?.[1];
  return {
    "@context": [ACTIVITY_STREAMS, "https://w3id.org/security/v1"],
    id: actor,
    type: "Person",
    preferredUsername: identity.username,
    name: profile.name,
    summary: profile.bio ? `<p>${escapeHtml(profile.bio)}</p>` : "",
    icon: {
      type: "Image",
      mediaType: iconType ? `image/${iconType}` : "image/svg+xml",
      url: `${config.origin}/activitypub/icon`,
    },
    inbox: `${config.origin}/activitypub/inbox`,
    outbox: `${config.origin}/activitypub/outbox`,
    followers: `${config.origin}/activitypub/followers`,
    following: `${config.origin}/activitypub/following`,
    publicKey: {
      id: `${actor}#main-key`,
      owner: actor,
      publicKeyPem: identity.publicKeyPem,
    },
  };
}

function collection(store, config, name) {
  const orderedItems =
    name === "outbox"
      ? store.federationOutboxActivities()
      : name === "followers"
        ? store.federationFollowers().map(({ actorId }) => actorId)
        : [];
  return {
    "@context": ACTIVITY_STREAMS,
    id: `${config.origin}/activitypub/${name}`,
    type: "OrderedCollection",
    totalItems: orderedItems.length,
    orderedItems,
  };
}

function iconResponse(store) {
  const icon = store.get("settings", "profile")?.icon || "🐢";
  const data = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(
    icon,
  );
  if (data) {
    return new Response(Buffer.from(data[2], "base64"), {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": `image/${data[1]}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#f0efeb"/><text x="64" y="84" text-anchor="middle" font-size="72">${escapeHtml(icon)}</text></svg>`;
  return new Response(svg, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseSignature(value) {
  const fields = {};
  for (const match of value.matchAll(/(?:^|,)\s*([a-zA-Z][\w-]*)="([^"]*)"/g))
    fields[match[1].toLowerCase()] = match[2];
  if (!fields.keyid || !fields.headers || !fields.signature)
    throw new Error("invalid signature header");
  if (fields.keyid.length > 2_048 || fields.signature.length > 8_192)
    throw new Error("signature header is too large");
  return fields;
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("base64");
}

function equalText(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signingString(request, headers) {
  const url = new URL(request.url);
  return headers
    .map((name) => {
      const lower = name.toLowerCase();
      if (lower === "(request-target)")
        return `(request-target): ${request.method.toLowerCase()} ${url.pathname}${url.search}`;
      const value = request.headers.get(lower);
      if (!value) throw new Error("signed header is missing");
      return `${lower}: ${value}`;
    })
    .join("\n");
}

export function signFederationRequest(
  urlValue,
  method,
  body,
  identity,
  date = new Date(),
) {
  const url = new URL(urlValue);
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body || "");
  const headers = {
    host: url.host,
    date: date.toUTCString(),
    digest: `SHA-256=${digest(bytes)}`,
    "content-type": "application/activity+json",
  };
  const request = new Request(url, { method, headers });
  const signedHeaders = ["(request-target)", "host", "date", "digest"];
  const signer = createSign("RSA-SHA256");
  signer.update(signingString(request, signedHeaders));
  signer.end();
  headers.signature = `keyId="${identity.actorUrl}#main-key",algorithm="rsa-sha256",headers="${signedHeaders.join(" ")}",signature="${signer.sign(identity.privateKeyPem, "base64")}"`;
  return headers;
}

export async function verifyFederationRequest(request, bytes, options = {}) {
  const providedDigest = request.headers.get("digest") || "";
  const digestMatch = /^sha-256=(.+)$/i.exec(providedDigest);
  if (!digestMatch || !equalText(digestMatch[1], digest(bytes)))
    throw new Error("digest mismatch");
  const date = Date.parse(request.headers.get("date") || "");
  const now = options.now?.getTime?.() ?? Date.now();
  if (!Number.isFinite(date) || Math.abs(now - date) > 10 * 60 * 1000)
    throw new Error("stale signature date");
  const raw =
    request.headers.get("signature") ||
    request.headers.get("authorization")?.replace(/^Signature\s+/i, "") ||
    "";
  const signature = parseSignature(raw);
  const signedHeaders = signature.headers.toLowerCase().split(/\s+/);
  for (const required of ["(request-target)", "host", "date", "digest"])
    if (!signedHeaders.includes(required))
      throw new Error("signature is incomplete");
  const fetchJson = options.fetchJson || fetchFederationJson;
  const { value: actor } = await fetchJson(
    signature.keyid,
    options.fetchOptions,
  );
  const publicKey = actor?.publicKey;
  if (
    !publicKey ||
    publicKey.id !== signature.keyid ||
    publicKey.owner !== actor.id ||
    typeof publicKey.publicKeyPem !== "string"
  )
    throw new Error("actor key is invalid");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingString(request, signedHeaders));
  verifier.end();
  if (!verifier.verify(publicKey.publicKeyPem, signature.signature, "base64"))
    throw new Error("signature verification failed");
  return actor;
}

async function inbox(store, request, options) {
  if (!store.rate("federation-inbox", 240))
    return jsonResponse({ error: "Try later" }, 429, "application/json");
  const contentType = (request.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    ![
      "application/activity+json",
      "application/ld+json",
      "application/json",
    ].includes(contentType)
  )
    return jsonResponse(
      { error: "Unsupported content type" },
      415,
      "application/json",
    );
  const bytes = await readBounded(request, 1024 * 1024);
  const actor = await verifyFederationRequest(request, bytes, options);
  const activity = JSON.parse(bytes.toString("utf8"));
  if (
    !activity ||
    typeof activity.id !== "string" ||
    activity.id.length > 2_048 ||
    typeof activity.type !== "string" ||
    typeof activity.actor !== "string" ||
    activity.actor !== actor.id
  )
    return jsonResponse({ error: "Invalid activity" }, 400, "application/json");
  const receivedAt = (options.now || new Date()).toISOString();
  const localActor = `${options.config.origin}/activitypub/actor`;
  if (activity.type === "Follow") {
    const objectId =
      typeof activity.object === "string"
        ? activity.object
        : activity.object?.id;
    if (objectId !== localActor || typeof actor.inbox !== "string")
      return jsonResponse({ error: "Invalid Follow" }, 400, "application/json");
    const inboxUrl = normalizeFederationUrl(
      actor.inbox,
      options.fetchOptions,
    ).toString();
    const sharedInboxUrl = actor.endpoints?.sharedInbox
      ? normalizeFederationUrl(
          actor.endpoints.sharedInbox,
          options.fetchOptions,
        ).toString()
      : null;
    store.transaction(() => {
      if (
        !store.recordFederationActivity({
          id: activity.id,
          actorId: actor.id,
          type: activity.type,
          receivedAt,
        })
      )
        return;
      store.saveFederationFollower({
        actorId: actor.id,
        inboxUrl,
        sharedInboxUrl,
        followActivityId: activity.id,
        followedAt: receivedAt,
      });
      const acceptId = `${options.config.origin}/activitypub/activities/accept/${createHash("sha256").update(activity.id).digest("hex")}`;
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
            actor: localActor,
            object: activity,
            to: [actor.id],
          },
        },
        [sharedInboxUrl || inboxUrl],
      );
    });
    return new Response(null, { status: 202 });
  }
  if (activity.type === "Undo") {
    const undone = activity.object;
    const followId =
      typeof undone === "string"
        ? undone
        : undone?.type === "Follow" &&
            undone.actor === actor.id &&
            (undone.object === localActor || undone.object?.id === localActor)
          ? undone.id
          : null;
    store.transaction(() => {
      if (
        !store.recordFederationActivity({
          id: activity.id,
          actorId: actor.id,
          type: activity.type,
          receivedAt,
        })
      )
        return;
      if (followId) store.removeFederationFollower(actor.id, String(followId));
    });
    return new Response(null, { status: 202 });
  }
  store.recordFederationActivity({
    id: activity.id,
    actorId: actor.id,
    type: activity.type.slice(0, 80),
    receivedAt,
  });
  return new Response(null, { status: 202 });
}

export function createActivityPubHandler(store, config, options = {}) {
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const identity = store.federationIdentity();
      if (!identity) return notFound();
      if (
        url.pathname === "/.well-known/webfinger" &&
        request.method === "GET"
      ) {
        const resource = `acct:${identity.username}@${new URL(config.origin).host}`;
        if (url.searchParams.get("resource") !== resource) return notFound();
        return jsonResponse(
          {
            subject: resource,
            links: [
              {
                rel: "self",
                type: "application/activity+json",
                href: `${config.origin}/activitypub/actor`,
              },
            ],
          },
          200,
          "application/jrd+json",
        );
      }
      if (url.pathname === "/activitypub/actor" && request.method === "GET")
        return jsonResponse(actorDocument(store, config, identity));
      if (url.pathname === "/activitypub/icon" && request.method === "GET")
        return iconResponse(store);
      for (const name of ["outbox", "followers", "following"])
        if (url.pathname === `/activitypub/${name}` && request.method === "GET")
          return jsonResponse(collection(store, config, name));
      if (
        url.pathname.startsWith("/activitypub/objects/") &&
        request.method === "GET"
      ) {
        const id = decodeURIComponent(
          url.pathname.slice("/activitypub/objects/".length),
        );
        const post = store.get("posts", id);
        if (!post?.federationEnabled || post.kind === "vlog") return notFound();
        return jsonResponse(localPostObject(store, config, post));
      }
      if (
        url.pathname.startsWith("/activitypub/activities/") &&
        request.method === "GET"
      ) {
        const id = `${config.origin}${url.pathname}`;
        const activity = store.federationOutboundActivity(id);
        return activity ? jsonResponse(activity.body) : notFound();
      }
      if (url.pathname === "/activitypub/inbox" && request.method === "POST")
        return await inbox(store, request, { ...options, config });
      return notFound();
    } catch (error) {
      if (error instanceof RangeError)
        return jsonResponse(
          { error: "Payload too large" },
          413,
          "application/json",
        );
      if (error instanceof SyntaxError)
        return jsonResponse(
          { error: "Invalid activity" },
          400,
          "application/json",
        );
      return jsonResponse(
        { error: "Federation request rejected" },
        401,
        "application/json",
      );
    }
  };
}
