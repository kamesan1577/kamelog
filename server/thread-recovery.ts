import { executeCommand } from "./storage/commands.ts";
import type { Store } from "./store.mjs";

// The web process can disappear while awaiting Jev. A timer run or the next
// publish recovers only old claims, never jobs another process is still doing.
// Each batch handles at most 20 jobs at an 8-second upstream timeout, so ten
// minutes is comfortably longer than an ordinary in-flight batch.
export function recoverStaleThreadJobs(store: Store, now = Date.now()): number {
  return executeCommand(store, "recoverThreadJobs", [now]);
}
