import { configuration } from "@/server/api.mjs";
import { getStore } from "@/server/runtime.mjs";
import { readBounded } from "@/server/validation.mjs";
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
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function owner(request: Request) {
  const name = configuration().secure
    ? "__Host-kamelog-session"
    : "kamelog-session";
  const session = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return getStore().authenticated(session);
}

function permit(request: Request) {
  if (!owner(request)) return json({ error: "Unauthorized" }, 401);
  if (
    request.method !== "GET" &&
    request.headers.get("origin") !== configuration().origin
  )
    return json({ error: "Origin rejected" }, 403);
  if (
    request.method !== "GET" &&
    !getStore().rate("notification-settings-write", 20)
  )
    return json({ error: "Try later" }, 429);
  return null;
}

export function GET(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  return json(
    notificationSettings(getStore(), configuration().inferenceEncryptionKey),
  );
}

export async function PUT(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  try {
    const input = JSON.parse((await readBounded(request, 8_192)).toString());
    return json(
      updateNotificationSettings(
        getStore(),
        configuration().inferenceEncryptionKey,
        input,
      ),
    );
  } catch (error) {
    if (error instanceof RangeError)
      return json({ error: "Payload too large" }, 413);
    // Never echo input, validation errors or webhook URLs in responses.
    return json({ error: "通知設定を確認してください。" }, 400);
  }
}

export function DELETE(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  return json(
    clearNotificationWebhook(
      getStore(),
      configuration().inferenceEncryptionKey,
    ),
  );
}

// Owner-only diagnostic messages are intentionally fixed: never reflect a URL,
// DNS answer, remote response body or exception string to the browser.
const testFailures: Record<string, string> = {
  not_configured: "Webhookが保存されていません。URLを入力して設定を保存してください。",
  encryption_unavailable:
    "暗号化鍵が利用できません。サーバー側の鍵の設定を確認してください。",
  credential_unreadable:
    "保存済みWebhookを復号できません。鍵が変更された可能性があります。新しいURLを保存し直してください。",
  invalid_destination:
    "保存済みWebhookのURLが無効です。通知先の種類とURLを確認して保存し直してください。",
  dns_failed:
    "通知先の名前を解決できませんでした。サーバーのDNS・ネットワーク設定を確認してください。",
  dns_rejected:
    "通知先のアドレスが安全性チェックで拒否されました。公開HTTPSの通知先を指定してください。",
  timeout:
    "通知先への接続がタイムアウトしました。サーバーの外向き通信を確認して再試行してください。",
  network_failed:
    "通知先との通信に失敗しました。サーバーのネットワーク・TLS設定を確認してください。",
  remote_unauthorized:
    "通知先がHTTP 401を返しました。Webhookの認証情報を再発行して設定し直してください。",
  remote_forbidden:
    "通知先がHTTP 403を返しました。Webhookの権限や通知先側の制限を確認してください。",
  remote_not_found:
    "通知先がHTTP 404を返しました。Webhookが削除・無効化されていないか確認し、再発行してください。",
  remote_rate_limited:
    "通知先がHTTP 429を返しました。送信頻度の制限中です。しばらくしてから再試行してください。",
  remote_rejected:
    "通知先がHTTPエラーを返しました。通知先の種類やWebhook設定を確認してください。",
  remote_unavailable:
    "通知先がHTTP 5xxを返しました。通知先サービスの状態を確認して再試行してください。",
  unknown: "通知テストを完了できませんでした。サーバー側の設定を確認してください。",
};

export async function POST(request: Request) {
  const denied = permit(request);
  if (denied) return denied;
  let failure = "unknown";
  const testOptions = {
    force: true,
    onFailure(reason: string) {
      failure = reason;
    },
  };
  const delivered = await reportNotification(
    getStore(),
    configuration().inferenceEncryptionKey,
    { service: "api", level: "info", code: "test" },
    testOptions,
  );
  return delivered
    ? json({ delivered: true })
    : json(
        {
          error: testFailures[failure] ?? testFailures.unknown,
          code: failure in testFailures ? failure : "unknown",
        },
        502,
      );
}
