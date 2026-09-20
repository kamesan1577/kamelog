import { JevClient, JevThreadInference } from "./inference/jev-client.mjs";
import { inferenceSecretBox } from "./inference/secret.mjs";
import { loadJevCredential } from "./inference/settings.mjs";
import { processThreadInferenceJobs } from "./thread-inference.mjs";
import { recoverStaleThreadJobs } from "./thread-recovery.ts";
import type { Store } from "./store.mjs";

// SQLite is the durable queue across blue and green. The existing systemd
// timer recovers missed wakeups; publishing never awaits Jev.
export function createThreadDispatcher(store: Store, encryptionKey: string) {
  let running = false;
  let requested = false;

  function dispatch() {
    requested = true;
    if (running) return;
    running = true;
    setImmediate(() => {
      void drain();
    });
  }

  async function drain() {
    try {
      while (requested) {
        requested = false;
        const box = inferenceSecretBox(encryptionKey);
        const apiKey = loadJevCredential(store, box);
        if (!apiKey) break;
        const client = new JevClient({ apiKey });
        const inference = new JevThreadInference(client);
        let count: number;
        do {
          recoverStaleThreadJobs(store);
          const summary = await processThreadInferenceJobs(store, inference);
          count = summary.processed + summary.retried + summary.dead;
          if (count > 0) {
            const event = { event: "thread_inference_dispatched", ...summary };
            console.info(JSON.stringify(event));
          }
        } while (count === 20);
      }
    } catch {
      // Only fixed codes are logged: no credentials or post content.
      requested = false;
      console.warn(JSON.stringify({ event: "thread_dispatch_failed" }));
    } finally {
      running = false;
      if (requested) dispatch();
    }
  }

  return dispatch;
}
