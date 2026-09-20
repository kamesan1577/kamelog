import { autoTagPosts } from "../server/auto-tagging.mjs";
import { JevClient, JevTagInference } from "../server/inference/jev-client.mjs";
import { inferenceSecretBox } from "../server/inference/secret.mjs";
import { loadJevCredential } from "../server/inference/settings.mjs";
import { Store } from "../server/store.mjs";

const store = new Store(process.env.KAMELOG_DATA_DIR || "/data");
try {
  // This setting is independent of auto-thread and defaults to OFF.
  if (!store.inferenceSettings()?.autoTagEnabled) {
    console.log(JSON.stringify({ disabled: true, processed: 0 }));
  } else {
    const box = inferenceSecretBox(
      process.env.KAMELOG_INFERENCE_ENCRYPTION_KEY,
    );
    const apiKey = loadJevCredential(store, box);
    if (!apiKey)
      throw new Error("Jev credentials or encryption key are unavailable");
    const tagInference = new JevTagInference(new JevClient({ apiKey }));
    const result = await autoTagPosts(store, {
      tagInference,
      requireEnabled: true,
    });
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  }
} finally {
  store.close();
}
