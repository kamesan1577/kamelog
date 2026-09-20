const messages = {
  400: "入力内容を確認して、もう一度お試しください。",
  401: "ログインが必要です。ログインしてから再試行してください。",
  403: "操作を許可できませんでした。ページを開き直してください。",
  404: "対象が見つかりません。最新の状態を確認してください。",
  409: "別の操作で変更されました。再読み込みしてください。",
  413: "ファイルまたは入力が大きすぎます。サイズを小さくしてください。",
  429: "操作が集中しています。少し経ってから再試行してください。",
};

export function apiErrorMessage(status, message) {
  // Preserve safe, actionable Japanese messages supplied by our own API.
  if (
    typeof message === "string" &&
    /[\u3040-\u30ff\u3400-\u9fff]/.test(message)
  )
    return message;
  return (
    messages[status] || "操作に失敗しました。入力を保持して再試行してください。"
  );
}

export const networkErrorMessage =
  "通信に失敗しました。接続を確認して、もう一度お試しください。";
