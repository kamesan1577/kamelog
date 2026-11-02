import { openStore } from "../server/storage/provider.ts";

const store = openStore(process.env.KAMELOG_DATA_DIR || ".runtime");
try {
  process.exitCode = store.federationDiagnostics().worker.healthy ? 0 : 1;
} finally {
  store.close();
}
