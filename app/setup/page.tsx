"use client";
import { useState } from "react";
import { registerPasskey } from "@/lib/api";
export default function Setup() {
  const [token, setToken] = useState(""),
    [message, setMessage] = useState("");
  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 24 }}>
      <h1>パスキー登録</h1>
      <p>
        初回はサーバーで設定した一回限りの登録トークンを入力してください。追加登録はログイン後に行えます。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await registerPasskey(token);
            location.assign("/");
          } catch {
            setMessage(
              "登録できませんでした。設定と認証状態を確認してください。",
            );
          }
        }}
      >
        <label>
          登録トークン
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <button type="submit">パスキーを登録</button>
      </form>
      <p role="status">{message}</p>
    </main>
  );
}
