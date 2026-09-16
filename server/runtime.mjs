import { Store } from "./store.mjs";
import { configuration, createAPI } from "./api.mjs";
import { createActivityPubHandler } from "./activitypub.mjs";
let store;
export function getStore() {
  return (store ??= new Store(process.env.KAMELOG_DATA_DIR || ".runtime"));
}
export function handle(request) {
  return createAPI(getStore(), configuration())(request);
}
export function handleActivityPub(request) {
  return createActivityPubHandler(getStore(), configuration())(request);
}
