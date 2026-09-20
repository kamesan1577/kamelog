import { lookup as dnsLookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { inferenceSecretBox } from "./inference/secret.mjs";

// Source and destination are independent: add an ID here and a reporter at the source,
// or register another destination adapter without touching API error handling.
export const NOTIFICATION_SERVICES = Object.freeze([
  "api",
  "activitypub",
  "process",
]);
export const NOTIFICATION_LEVELS = Object.freeze([
  "debug",
  "info",
  "warn",
  "error",
  "critical",
]);
export const NOTIFICATION_PROVIDERS = Object.freeze([
  "discord",
  "slack",
  "generic",
]);
const SETTINGS_ID = "notifications";
const CREDENTIAL_ID = "notifications:webhook";
const defaults = Object.freeze({
  enabled: false,
  provider: "discord",
  minimumLevel: "error",
  services: [...NOTIFICATION_SERVICES],
});
const messages = Object.freeze({
  unexpected_failure: "サーバー処理で予期しないエラーが発生しました。",
  unhandled_exception: "Node.js プロセスで未処理の例外が発生しました。",
  delivery_failure: "外部サービスとの通信が失敗しました。",
  test: "kamelog の通知テストです。",
});

export function notificationSettings(store, encryptionKey) {
  const saved = store.get("settings", SETTINGS_ID) || {};
  const credential = store.get("settings", CREDENTIAL_ID);
  const { enabled, provider, minimumLevel, services } = {
    ...defaults,
    ...saved,
  };
  return {
    enabled,
    provider,
    minimumLevel,
    services,
    webhookConfigured: Boolean(credential && credential.provider === provider),
    encryptionAvailable: Boolean(inferenceSecretBox(encryptionKey)),
  };
}

const blocked = new BlockList();
for (const [range, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  blocked.addSubnet(range, prefix, "ipv4");
for (const [range, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
  ["::ffff:0:0", 96],
])
  blocked.addSubnet(range, prefix, "ipv6");

function publicAddress(address, family) {
  return (
    (family === 4 || family === 6) &&
    !blocked.check(address, family === 4 ? "ipv4" : "ipv6") &&
    (family === 4 ||
      address.toLowerCase().startsWith("2") ||
      address.toLowerCase().startsWith("3"))
  );
}

export function validateWebhookUrl(value, provider) {
  if (typeof value !== "string" || value.length > 2048)
    throw new TypeError("Invalid webhook URL");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError("Invalid webhook URL");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    isIP(url.hostname) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal") ||
    !url.hostname.includes(".")
  )
    throw new TypeError("Invalid webhook URL");
  if (
    provider === "discord" &&
    !(
      ["discord.com", "discordapp.com"].includes(url.hostname) &&
      /^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) &&
      !url.search
    )
  )
    throw new TypeError("Invalid Discord webhook URL");
  if (
    provider === "slack" &&
    !(
      url.hostname === "hooks.slack.com" &&
      /^\/services\/[A-Za-z0-9/_-]+$/.test(url.pathname) &&
      !url.search
    )
  )
    throw new TypeError("Invalid Slack webhook URL");
  if (
    provider === "generic" &&
    (!/^[a-z0-9.-]+$/i.test(url.hostname) ||
      url.hostname.endsWith(".example") ||
      url.hostname.endsWith(".test"))
  )
    throw new TypeError("Invalid webhook URL");
  return url.toString();
}

export function updateNotificationSettings(store, encryptionKey, input) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) =>
        ![
          "enabled",
          "provider",
          "minimumLevel",
          "services",
          "webhookUrl",
        ].includes(key),
    )
  )
    throw new TypeError("Invalid notification settings");
  const current = notificationSettings(store, encryptionKey);
  const next = {
    enabled: input.enabled ?? current.enabled,
    provider: input.provider ?? current.provider,
    minimumLevel: input.minimumLevel ?? current.minimumLevel,
    services: input.services ?? current.services,
  };
  if (
    typeof next.enabled !== "boolean" ||
    !NOTIFICATION_PROVIDERS.includes(next.provider) ||
    !NOTIFICATION_LEVELS.includes(next.minimumLevel) ||
    !Array.isArray(next.services) ||
    next.services.some((s) => !NOTIFICATION_SERVICES.includes(s)) ||
    new Set(next.services).size !== next.services.length
  )
    throw new TypeError("Invalid notification settings");
  const hasUrl = Object.hasOwn(input, "webhookUrl");
  const box = inferenceSecretBox(encryptionKey);
  let encrypted;
  if (hasUrl) {
    if (!box) throw new TypeError("Notification encryption key unavailable");
    encrypted = box.encrypt(
      validateWebhookUrl(input.webhookUrl, next.provider),
    );
  }
  if (
    next.enabled &&
    !(
      hasUrl ||
      (next.provider === current.provider && current.webhookConfigured)
    )
  )
    throw new TypeError("Configure a webhook before enabling notifications");
  // Make provider, settings and encrypted destination change together.
  store.transaction(() => {
    if (next.provider !== current.provider && !hasUrl)
      store.remove("settings", CREDENTIAL_ID);
    if (hasUrl)
      store.save("settings", CREDENTIAL_ID, {
        provider: next.provider,
        encrypted,
      });
    store.save("settings", SETTINGS_ID, next);
  });
  return notificationSettings(store, encryptionKey);
}

export function clearNotificationWebhook(store, encryptionKey) {
  store.transaction(() => {
    store.remove("settings", CREDENTIAL_ID);
    store.save("settings", SETTINGS_ID, {
      ...notificationSettings(store, encryptionKey),
      enabled: false,
      webhookConfigured: undefined,
      encryptionAvailable: undefined,
    });
  });
  return notificationSettings(store, encryptionKey);
}

// URL resolution is performed by the socket's own lookup callback, not a separate
// check-then-connect DNS query. Redirects are never followed and bodies are bounded.
function sendHttps(urlString, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const bytes = Buffer.from(JSON.stringify(payload));
    const request = httpsRequest(
      url,
      {
        method: "POST",
        timeout: 4_000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": bytes.length,
        },
        lookup(hostname, options, callback) {
          dnsLookup(hostname, { all: true }, (error, addresses) => {
            if (
              error ||
              !addresses?.length ||
              addresses.some(
                ({ address, family }) => !publicAddress(address, family),
              )
            ) {
              callback(new Error("Webhook DNS rejected"));
              return;
            }
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          });
        },
      },
      (response) => {
        // Deliberately do not read, return or log response bodies (which may contain secrets).
        response.resume();
        response.on("end", () => {
          if (response.statusCode >= 200 && response.statusCode < 300)
            resolve(true);
          else reject(new Error("Webhook delivery failed"));
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("Webhook timeout")));
    request.on("error", reject);
    request.end(bytes);
  });
}

export const notificationDestinations = Object.freeze({
  discord: (url, event, send = sendHttps) =>
    send(url, {
      content: `[${event.level.toUpperCase()}] ${event.service}: ${event.message} (${event.code}) · ${event.timestamp}`,
      allowed_mentions: { parse: [] },
    }),
  slack: (url, event, send = sendHttps) =>
    send(url, {
      text: `[${event.level.toUpperCase()}] ${event.service}: ${event.message} (${event.code}) · ${event.timestamp}`,
    }),
  generic: (url, event, send = sendHttps) => send(url, event),
});

const recent = new Map();
let inFlight = 0;
export async function reportNotification(
  store,
  encryptionKey,
  event,
  { send = sendHttps, force = false } = {},
) {
  try {
    const settings = notificationSettings(store, encryptionKey);
    if (
      (!settings.enabled && !force) ||
      !settings.webhookConfigured ||
      (!force &&
        (!settings.services.includes(event.service) ||
          NOTIFICATION_LEVELS.indexOf(event.level) <
            NOTIFICATION_LEVELS.indexOf(settings.minimumLevel)))
    )
      return false;
    if (
      !NOTIFICATION_SERVICES.includes(event.service) ||
      !NOTIFICATION_LEVELS.includes(event.level) ||
      !Object.hasOwn(messages, event.code) ||
      inFlight >= 8
    )
      return false;
    const key = `${settings.provider}:${event.service}:${event.code}`;
    const now = Date.now();
    if (!force && now - (recent.get(key) || 0) < 60_000) return false;
    const box = inferenceSecretBox(encryptionKey);
    if (!box) return false;
    const credential = store.get("settings", CREDENTIAL_ID);
    const url = validateWebhookUrl(
      box.decrypt(credential.encrypted),
      settings.provider,
    );
    const payload = {
      timestamp: new Date(now).toISOString(),
      level: event.level,
      service: event.service,
      code: event.code,
      message: messages[event.code],
    };
    recent.set(key, now);
    if (recent.size > 256) recent.clear();
    inFlight++;
    try {
      await notificationDestinations[settings.provider](url, payload, send);
      return true;
    } finally {
      inFlight--;
    }
  } catch {
    // Notifications must never affect HTTP responses, worker progress or process exit.
    return false;
  }
}
