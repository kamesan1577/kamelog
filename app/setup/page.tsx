"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { registerPasskey } from "@/lib/api";
import Link from "next/link";
import { ThemeControl } from "@/components/design-system/patterns/ThemeControl";
import { Input } from "@/components/design-system/primitives/Input";
import { Button } from "@/components/design-system/primitives/Button";
export default function Setup() {
  const router = useRouter();
  const [token, setToken] = useState(""),
    [message, setMessage] = useState("");
  return (
    <main style={{ maxWidth: 520, margin: "64px auto", padding: 24 }}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="font-medium">
          kamelog
        </Link>
        <ThemeControl />
      </div>
      <h1 className="text-xl font-medium">パスキー登録</h1>
      <p className="mt-4 text-sm leading-relaxed text-ds-secondary">
        初回はサーバーで設定した一回限りの登録トークンを入力してください。追加登録はログイン後に行えます。
      </p>
      <form
        className="mt-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await registerPasskey(token);
            router.push("/");
            router.refresh();
          } catch {
            setMessage(
              "登録できませんでした。設定と認証状態を確認してください。",
            );
          }
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          登録トークン
          <Input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </label>
        <Button type="submit">パスキーを登録</Button>
      </form>
      <p className="mt-4 text-sm text-ds-danger" role="status">
        {message}
      </p>
    </main>
  );
}
