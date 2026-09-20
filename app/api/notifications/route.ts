import { configuration } from "@/server/api.mjs";
import { getStore } from "@/server/runtime.mjs";
import {
  clearNotificationWebhook,
  notificationSettings,
  reportNotification,
  updateNotificationSettings,
} from "@/server/notifications.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function owner(request: Request) {
  const name = configuration().secure ? "__Host-kamelog-session" : "kamelog-session";
  const session = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  return getStore().authenticated(session);
}

function permit(request: Request) {
  if (!owner(request)) return json({ error: "Unauthorized" }, 401);
  if (request.method !== "GET" && request.headers.get("origin") !== configuration().origin)
    return json({ error: "Origin rejected" }, 403);
  if (request.method !== "GET" && !getStore().rate("notification-settings-write", 20))
    return json({ error: "Try later" }, 429);
  return null;
}

export function GET(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  return json(notificationSettings(getStore(), configuration().inferenceEncryptionKey));
}

export async function PUT(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 8_192) return json({ error: "Payload too large" }, 413);
    return json(updateNotificationSettings(getStore(), configuration().inferenceEncryptionKey, JSON.parse(raw)));
  } catch {
    // Never echo input, validation errors, or webhook URLs in responses.
    return json({ error: "通知設定を確認してください。" }, 400);
  }
}

export function DELETE(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  return json(clearNotificationWebhook(getStore(), configuration().inferenceEncryptionKey));
}

export async function POST(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  const delivered = await reportNotification(getStore(), configuration().inferenceEncryptionKey,
    { service: "api", level: "info", code: "test" }, { force: true });
  return delivered ? json({ delivered: true }) : json({ error: "通知テストに失敗しました。設定を確認してください。" }, 502);
}
