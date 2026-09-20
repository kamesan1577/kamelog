import { JevClient, JevThreadInference } from "./inference/jev-client.mjs";
import { inferenceSecretBox } from "./inference/secret.mjs";
import { loadJevCredential } from "./inference/settings.mjs";
import { processThreadInferenceJobs } from "./thread-inference.mjs";
import { recoverStaleThreadJobs } from "./thread-recovery.ts";
import type { Store } from "./store.mjs";

// A per-process dispatcher only wakes after a successful post write. SQLite is
// the durable queue and atomically claims jobs across the blue/green servers.
// The existing systemd timer remains a fallback if this process exits before
// dispatching. Never await this dispatcher in the post request.
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
        const apiKey = loadJevCredential(
          store,
          inferenceSecretBox(encryptionKey),
        );
        if (!apiKey) break;

        const inference = new JevThreadInference(new JevClient({ apiKey }));
        let count: number;
        do {
          recoverStaleThreadJobs(store);
          const summary = await processThreadInferenceJobs(store, inference);
          count = summary.processed + summary.retried + summary.dead;
          if (count)
            console.info(
              JSON.stringify({ event: "thread_inference_dispatched", ...summary }),
            );
        } while (count === 20);
      }
    } catch {
      // The queue remains durable; the periodic runner will recover. Do not log
      // arbitrary exception messages, credentials or user-generated post text.
      requested = false;
      console.warn(JSON.stringify({ event: "thread_dispatch_failed" }));
    } finally {
      running = false;
      if (requested) dispatch();
    }
  }

  return dispatch;
}
