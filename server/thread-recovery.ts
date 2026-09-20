import type { Store } from "./store.mjs";

// The web process can disappear while awaiting Jev. A timer run or the next
// publish recovers only old claims, never jobs another process is still doing.
// Each batch handles at most 20 jobs at an 8-second upstream timeout, so ten
// minutes is comfortably longer than an ordinary in-flight batch.
export function recoverStaleThreadJobs(
  store: Store,
  now = Date.now(),
): number {
  const updatedAt = new Date(now).toISOString();
  const staleBefore = new Date(now - 10 * 60_000).toISOString();
  const result = store.db
    .prepare(
      `UPDATE inference_jobs
       SET state='retry', next_attempt_at=?, last_error_code='interrupted',
           updated_at=?, completed_at=NULL
       WHERE task='thread' AND state='processing' AND updated_at<?`,
    )
    .run(now, updatedAt, staleBefore);
  return Number(result.changes);
}
