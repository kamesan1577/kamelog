import { configuration } from "./api.mjs";
import { getStore } from "./runtime.mjs";
import { reportNotification } from "./notifications.mjs";

const installed = Symbol.for("kamelog.notifications.process-monitor");

// Preserve Node's exception behavior and the original console output. The
// destination only receives a fixed event code, never arguments or stack traces.
export function installProcessNotificationMonitor() {
  if (process[installed]) return;
  process[installed] = true;
  const report = (level, code) => {
    try {
      void reportNotification(getStore(), configuration().inferenceEncryptionKey,
        { service: "process", level, code });
    } catch { /* A broken alerting setup may never interrupt the application. */ }
  };
  const originalError = console.error;
  console.error = (...args) => {
    originalError.apply(console, args);
    report("error", "unexpected_failure");
  };
  // This listener does not suppress the default uncaught exception handling.
  // A fatal process exit can prevent the best-effort HTTP request from completing.
  process.on("uncaughtExceptionMonitor", () => report("critical", "unhandled_exception"));
}
