import { configuration } from "../server/api.mjs";
import { runFederationWorker } from "../server/federation-worker.mjs";
import { Store } from "../server/store.mjs";

const store = new Store(process.env.KAMELOG_DATA_DIR || ".runtime");
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
