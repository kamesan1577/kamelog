import { Store } from "../server/store.mjs";

const store = new Store(process.env.KAMELOG_DATA_DIR || ".runtime");
try {
  process.exitCode = store.federationDiagnostics().worker.healthy ? 0 : 1;
} finally {
  store.close();
}
