import { Store } from "./store.mjs";
import { configuration, createAPI } from "./api.mjs";
import { createActivityPubHandler } from "./activitypub.mjs";
import { reportNotification } from "./notifications.mjs";
import { createThreadDispatcher } from "./thread-dispatcher.ts";
let store;
let threadDispatcher;
export function getStore() {
  return (store ??= new Store(process.env.KAMELOG_DATA_DIR || ".runtime"));
}

async function monitored(request, service, handler, config) {
  try {
    const response = await handler(request);
    let unexpected = response.status >= 500;
    if (service === "api" && response.status === 400) {
      try {
        const body = await response.clone().json();
        unexpected =
          body?.error ===
          "操作に失敗しました。入力を保持して再試行してください。";
      } catch {
        /* Non-JSON responses are not errors by themselves. */
      }
    }
    if (unexpected)
      void reportNotification(getStore(), config.inferenceEncryptionKey, {
        service,
        level: "error",
        code: "unexpected_failure",
      });
    return response;
  } catch (error) {
    // Report only fixed event codes: request paths, headers, user content and exception
    // messages may contain secrets and must never reach a third-party webhook.
    void reportNotification(getStore(), config.inferenceEncryptionKey, {
      service,
      level: "critical",
      code: "unhandled_exception",
    });
    throw error;
  }
}

export async function handle(request) {
  const config = configuration();
  const response = await monitored(
    request,
    "api",
    createAPI(getStore(), config),
    config,
  );
  // The API has committed both post and durable inference job before returning.
  // Wake a per-process dispatcher without awaiting Jev or delaying the response.
  if (
    response.ok &&
    (request.method === "POST" || request.method === "PUT") &&
    /^\/api\/posts(?:\/[^/]+)?$/.test(new URL(request.url).pathname) &&
    getStore().inferenceSettings()?.autoThreadEnabled
  ) {
    (threadDispatcher ??= createThreadDispatcher(
      getStore(),
      config.inferenceEncryptionKey,
    ))();
  }
  return response;
}
export function handleActivityPub(request) {
  const config = configuration();
  return monitored(
    request,
    "activitypub",
    createActivityPubHandler(getStore(), config),
    config,
  );
}
