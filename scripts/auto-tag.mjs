import { autoTagPosts } from "../server/auto-tagging.mjs";
import { Store } from "../server/store.mjs";

const store = new Store(process.env.KAMELOG_DATA_DIR || "/data");
try {
  console.log(JSON.stringify(autoTagPosts(store)));
} finally {
  store.close();
}
