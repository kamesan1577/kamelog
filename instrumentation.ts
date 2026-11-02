export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installProcessNotificationMonitor } =
      await import("./server/notifications-process.mjs");
    installProcessNotificationMonitor();
  }
}
