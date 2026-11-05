import { StorageError } from "./storage/errors.ts";

type Options = {
  signal?: AbortSignal;
  pollMs: number;
  onHeartbeat?: () => void;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

/** Storage failures back off in-process; container restarts must not amplify them. */
export async function runDeliveryLoop(
  operation: () => Promise<unknown>,
  options: Options,
) {
  let failures = 0;
  const wait =
    options.wait ||
    ((ms, signal) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", finish);
          resolve();
        };
        const timer = setTimeout(finish, ms);
        signal?.addEventListener("abort", finish, { once: true });
        if (signal?.aborted) finish();
      }));
  while (!options.signal?.aborted) {
    let pause = 0;
    try {
      const result = await operation();
      failures = 0;
      if (!result) pause = options.pollMs;
    } catch (error) {
      if (!(error instanceof StorageError)) throw error;
      failures++;
      pause = Math.min(
        300_000,
        Math.max(options.pollMs, 15_000) * 2 ** Math.min(failures - 1, 5),
      );
    }
    options.onHeartbeat?.();
    while (pause > 0 && !options.signal?.aborted) {
      const interval = Math.min(pause, 15_000);
      await wait(interval, options.signal);
      pause -= interval;
      if (!options.signal?.aborted) options.onHeartbeat?.();
    }
  }
}
