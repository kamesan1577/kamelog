export const storageErrorCodes = [
  "storage_limit",
  "storage_unavailable",
  "storage_integrity",
  "storage_conflict",
  "storage_migrating",
  "storage_configuration",
] as const;
export type StorageErrorCode = (typeof storageErrorCodes)[number];

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  constructor(code: StorageErrorCode) {
    super(code);
    this.name = "StorageError";
    this.code = code;
  }
}

export function storageErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof StorageError)) return;
  const messages: Record<StorageErrorCode, string> = {
    storage_limit:
      "保存サービスの利用上限に達しました。入力内容を残したまま、投稿一覧・下書きで保存結果を確認してください。未保存の場合は、容量または利用枠の回復後に再試行してください。",
    storage_unavailable:
      "保存サービスに接続できず、保存結果を確認できませんでした。入力内容を残し、再送する前に投稿一覧を確認してください。",
    storage_integrity:
      "保存データの検証に失敗しました。入力内容を残したまま、管理者に確認してください。",
    storage_conflict:
      "別の操作と競合しました。入力内容を残したまま、再読み込みして確認してください。",
    storage_migrating:
      "データを移行中のため、保存を一時停止しています。入力内容を残したまま、移行完了後に再試行してください。",
    storage_configuration:
      "保存先の設定を確認できませんでした。入力内容を残したまま、管理者に確認してください。",
  };
  return Response.json(
    { error: messages[error.code], code: error.code },
    {
      status:
        error.code === "storage_limit"
          ? 507
          : error.code === "storage_conflict"
            ? 409
            : 503,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
