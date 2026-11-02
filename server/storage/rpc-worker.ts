import { workerData } from "node:worker_threads";
import type { MessagePort } from "node:worker_threads";
import { storageHttpError } from "./http-errors.ts";

// Runs outside the web event loop. No credential, body or provider error is logged.
const { port, endpoint, token, generation } = workerData as {
  port: MessagePort;
  endpoint: string;
  token: string;
  generation: string;
};
port.on(
  "message",
  async (message: { signal: SharedArrayBuffer; body: string }) => {
    let result: unknown = { transportError: "storage_unavailable" };
    // Reuse the exact request ID after a lost reply; the gateway deduplicates writes.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(new URL("/rpc", endpoint), {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-Storage-Generation": generation,
          },
          body: message.body,
          redirect: "error",
          signal: AbortSignal.timeout(20_000),
        });
        const responseBody = await response.text();
        const code = storageHttpError(response.status, responseBody);
        if (
          code === "storage_limit" ||
          code === "storage_configuration" ||
          code === "storage_migrating"
        ) {
          result = { transportError: code };
          break;
        }
        try {
          result = { status: response.status, body: JSON.parse(responseBody) };
          break;
        } catch {
          /* Retry an ambiguous acknowledgement with the same ID. */
        }
      } catch {
        /* No raw fetch errors cross this boundary. */
      }
    }
    port.postMessage(result);
    const signal = new Int32Array(message.signal);
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  },
);
