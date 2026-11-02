import { configuration } from "../server/api.mjs";
import {
  JevClient,
  JevThreadInference,
} from "../server/inference/jev-client.mjs";
import { inferenceSecretBox } from "../server/inference/secret.mjs";
import { loadJevCredential } from "../server/inference/settings.mjs";
import { openStore } from "../server/storage/provider.ts";
import { processThreadInferenceJobs } from "../server/thread-inference.mjs";
import { recoverStaleThreadJobs } from "../server/thread-recovery.ts";

const store = openStore(process.env.KAMELOG_DATA_DIR || "/data");
try {
  recoverStaleThreadJobs(store);
  const config = configuration();
  const secretBox = inferenceSecretBox(config.inferenceEncryptionKey);
  const apiKey = loadJevCredential(store, secretBox);
  if (!apiKey)
    console.log(JSON.stringify({ processed: 0, skipped: "not_configured" }));
  else {
    const threadInference = new JevThreadInference(new JevClient({ apiKey }));
    console.log(
      JSON.stringify(await processThreadInferenceJobs(store, threadInference)),
    );
  }
} finally {
  store.close();
}
