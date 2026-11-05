import { executeCommand } from "./storage/commands.ts";
import { runDeliveryLoop } from "./federation-worker-loop.ts";
import { signFederationRequest } from "./activitypub.mjs";
import { postFederationActivity } from "./federation-fetch.mjs";

function logDelivery(log, delivery, status) {
  if (!log) return;
  let domain = "invalid";
  try {
    domain = new URL(delivery.inboxUrl).hostname;
  } catch {}
  log({
    activityType: delivery.type,
    remoteDomain: domain,
    status,
    retryCount: Math.max(0, delivery.attempts - 1),
  });
}

export async function processNextFederationDelivery(
  store,
  config,
  options = {},
) {
  const now = options.now || new Date();
  const { delivery, identity } = executeCommand(store, "pollFederation", [
    now.getTime(),
  ]);
  if (!delivery) return null;
  if (!identity) {
    const result = store.failFederationDelivery(delivery.id, {
      error: "federation identity is unavailable",
      now: now.getTime(),
    });
    logDelivery(options.log, delivery, result.dead ? "dead" : "retry");
    return { delivery, state: result.dead ? "dead" : "pending" };
  }
  const body = Buffer.from(delivery.body);
  const send = options.postActivity || postFederationActivity;
  try {
    const response = await send(
      delivery.inboxUrl,
      body,
      (url, bytes) =>
        signFederationRequest(url, "POST", bytes, {
          actorUrl: `${config.origin}/activitypub/actor`,
          privateKeyPem: identity.privateKeyPem,
        }),
      options.fetchOptions,
    );
    if (response.status >= 200 && response.status < 300) {
      store.completeFederationDelivery(delivery.id, response.status, now);
      logDelivery(options.log, delivery, response.status);
      return { delivery, state: "succeeded", status: response.status };
    }
    const result = store.failFederationDelivery(delivery.id, {
      status: response.status,
      error: `HTTP ${response.status}`,
      now: now.getTime(),
      maxAttempts: options.maxAttempts,
    });
    logDelivery(options.log, delivery, result.dead ? "dead" : "retry");
    return {
      delivery,
      state: result.dead ? "dead" : "pending",
      status: response.status,
    };
  } catch {
    const result = store.failFederationDelivery(delivery.id, {
      error: "network failure",
      now: now.getTime(),
      maxAttempts: options.maxAttempts,
    });
    logDelivery(options.log, delivery, result.dead ? "dead" : "retry");
    return { delivery, state: result.dead ? "dead" : "pending" };
  }
}

/**
 * @param {unknown} store
 * @param {{ origin: string }} config
 * @param {{ signal?: AbortSignal; pollMs?: number; log?: (entry: unknown) => void; onHeartbeat?: () => void }} [workerOptions]
 */
export async function runFederationWorker(store, config, workerOptions = {}) {
  const {
    signal,
    pollMs = store?.provider === "cloudflare" ? 15_000 : 1_000,
    onHeartbeat,
    ...options
  } = workerOptions;
  return runDeliveryLoop(
    () => processNextFederationDelivery(store, config, options),
    { signal, pollMs, onHeartbeat },
  );
}
