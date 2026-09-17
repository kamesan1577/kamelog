import { configuration } from "../server/api.mjs";
import { runFederationWorker } from "../server/federation-worker.mjs";
import { Store } from "../server/store.mjs";

const directory = process.env.KAMELOG_DATA_DIR || ".runtime";
let store;
for (let attempt = 0; attempt < 10; attempt += 1) {
  try {
    store = new Store(directory);
    break;
  } catch (error) {
    if (error?.code !== "ERR_SQLITE_ERROR" || !/locked/i.test(error.message))
      throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!store)
  throw new Error("Federation worker database did not become available");
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => controller.abort());

try {
  await runFederationWorker(store, configuration(), {
    signal: controller.signal,
    log: (entry) => console.log(JSON.stringify(entry)),
  });
} finally {
  store.close();
}
