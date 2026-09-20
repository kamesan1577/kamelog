"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Bell, Check, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/notion/button";

type Service = "api" | "activitypub" | "process";
type Level = "debug" | "info" | "warn" | "error" | "critical";
type Provider = "discord" | "slack" | "generic";
type Settings = {
  enabled: boolean;
  provider: Provider;
  minimumLevel: Level;
  services: Service[];
  webhookConfigured: boolean;
  encryptionAvailable: boolean;
};
const serviceLabels: Record<Service, string> = {
  api: "Web API",
  activitypub: "ActivityPub",
  process: "Node.js プロセス",
};
const levels: { value: Level; label: string }[] = [
  { value: "debug", label: "DEBUG 以上" },
  { value: "info", label: "INFO 以上" },
  { value: "warn", label: "WARN 以上" },
  { value: "error", label: "ERROR 以上" },
  { value: "critical", label: "CRITICAL のみ" },
];

export function NotificationSettings() {
  const [original, setOriginal] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function reload() {
    const current = await api<Settings>("notifications");
    setOriginal(current);
    setDraft(current);
    setWebhookUrl("");
  }
  useEffect(() => {
    let mounted = true;
    api<Settings>("notifications")
      .then((current) => { if (mounted) { setOriginal(current); setDraft(current); } })
      .catch(() => { if (mounted) setError("設定を読み込めませんでした。再読み込みしてください。"); });
    return () => { mounted = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !original || busy) return;
    setError(""); setMessage("");
    if (draft.provider !== original.provider && !webhookUrl.trim()) {
      setError("通知先の種類を変更した場合は、新しいWebhook URLを入力してください。");
      return;
    }
    setBusy(true);
    try {
      const updated = await api<Settings>("notifications", "PUT", {
        enabled: draft.enabled,
        provider: draft.provider,
        minimumLevel: draft.minimumLevel,
        services: draft.services,
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
      });
      setOriginal(updated);
      setDraft(updated);
      setWebhookUrl("");
      setMessage("通知設定を保存しました。");
    } catch {
      setError("保存に失敗しました。Webhook URLと設定内容を確認してください。");
    } finally { setBusy(false); }
  }

  async function test() {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api<{ delivered: boolean }>("notifications", "POST");
      setMessage("テスト通知を送信しました。通知先をご確認ください。");
    } catch {
      setError("送信に失敗しました。URLや通知先の設定を確認してください。");
    } finally { setBusy(false); }
  }

  async function clear() {
    if (busy || !window.confirm("Webhookを削除し、通知を無効にしますか？")) return;
    setBusy(true); setError(""); setMessage("");
    try { await api("notifications", "DELETE"); await reload(); setMessage("Webhookを削除しました。"); }
    catch { setError("削除できませんでした。"); }
    finally { setBusy(false); }
  }

  const field = "mt-2 w-full rounded-md border border-[#dcd9d2] bg-white px-3 py-2.5 text-base text-[#37352f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#827c70]";
  return (
    <main data-ds="owner-notifications" className="mx-auto min-h-screen max-w-2xl px-5 py-10 text-[#37352f] sm:px-8 sm:py-16">
      <a href="/?view=account" className="mb-8 inline-flex items-center gap-2 text-sm text-[#787774] hover:underline"><ArrowLeft size={16} /> サイトへ戻る</a>
      <header className="mb-8 flex items-start gap-3">
        <Bell aria-hidden="true" className="mt-1 shrink-0 text-[#787774]" size={25} />
        <div><h1 className="text-2xl font-bold tracking-tight">サーバー通知</h1>
          <p className="mt-2 text-sm leading-6 text-[#787774]">通知先と対象サービスを設定します。Webhook URLは保存後に再表示されません。</p>
        </div>
      </header>
      {!draft ? (
        <div role="status" className="rounded-lg border border-[#e9e9e7] p-6 text-sm">{error || "設定を読み込んでいます…"}</div>
      ) : (
        <form onSubmit={(event) => void save(event)} className="space-y-7 rounded-xl border border-[#e9e9e7] bg-white p-5 shadow-sm sm:p-7">
          <label className="flex items-center justify-between gap-3">
            <span><strong className="block text-sm">通知を有効にする</strong><span className="mt-1 block text-xs text-[#787774]">初期状態では無効です。</span></span>
            <input type="checkbox" role="switch" aria-label="通知を有効にする" checked={draft.enabled} disabled={busy}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} className="h-5 w-5 accent-[#555149]" />
          </label>
          <div className="border-t border-[#e9e9e7] pt-6">
            <label htmlFor="notification-provider" className="block text-sm font-semibold">通知先の種類</label>
            <select id="notification-provider" className={field} value={draft.provider} disabled={busy}
              onChange={(event) => { setDraft({ ...draft, provider: event.target.value as Provider }); setWebhookUrl(""); }}>
              <option value="discord">Discord</option><option value="slack">Slack</option><option value="generic">汎用JSON Webhook</option>
            </select>
            <label htmlFor="notification-webhook" className="mt-5 block text-sm font-semibold">Webhook URL</label>
            <input id="notification-webhook" className={field} type="password" autoComplete="new-password" spellCheck={false}
              value={webhookUrl} disabled={busy || !draft.encryptionAvailable}
              onChange={(event) => setWebhookUrl(event.target.value)}
              placeholder={draft.provider === original?.provider && draft.webhookConfigured ? "設定済み（変更時のみ入力）" : "HTTPSのWebhook URL"}
              aria-describedby="notification-secret-help" />
            <p id="notification-secret-help" className="mt-2 text-xs leading-5 text-[#787774]">
              {draft.provider === original?.provider && draft.webhookConfigured ? "Webhookは設定済みです。空欄なら既存のURLを維持します。" : "新しい通知先のWebhook URLを入力してください。"}
              暗号化してサーバー内に保存し、APIからは返しません。
            </p>
            {!draft.encryptionAvailable && <p role="alert" className="mt-2 text-sm text-red-700">暗号化鍵が使えません。ホストの暗号化鍵を確認してください。</p>}
          </div>
          <div className="border-t border-[#e9e9e7] pt-6">
            <label htmlFor="notification-level" className="block text-sm font-semibold">通知するログレベル</label>
            <select id="notification-level" className={field} value={draft.minimumLevel} disabled={busy}
              onChange={(event) => setDraft({ ...draft, minimumLevel: event.target.value as Level })}>
              {levels.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
            </select>
          </div>
          <fieldset className="border-t border-[#e9e9e7] pt-6">
            <legend className="text-sm font-semibold">通知対象サービス</legend>
            <div className="mt-3 space-y-3">{(Object.keys(serviceLabels) as Service[]).map((service) => (
              <label key={service} className="flex items-center gap-3 text-sm">
                <input type="checkbox" checked={draft.services.includes(service)} disabled={busy}
                  onChange={(event) => setDraft({ ...draft, services: event.target.checked
                    ? [...draft.services, service] : draft.services.filter((item) => item !== service) })}
                  className="h-4 w-4 accent-[#555149]" />{serviceLabels[service]}
              </label>
            ))}</div>
            <p className="mt-2 text-xs text-[#787774]">対象はアプリ内のAPI・ActivityPub処理とNode.jsの未処理例外です。systemdなどホスト側のログは対象外です。</p>
          </fieldset>
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="flex items-center gap-2 rounded-md bg-[#edf5ed] px-3 py-2 text-sm text-[#30613c]"><Check size={16} />{message}</p>}
          <div className="flex flex-wrap items-center gap-3 border-t border-[#e9e9e7] pt-6">
            <Button type="submit" variant="solid" disabled={busy || !draft.encryptionAvailable}>{busy ? "処理中…" : "設定を保存"}</Button>
            <Button type="button" disabled={busy || !original?.webhookConfigured} onClick={() => void test()}>テスト送信</Button>
            {original?.webhookConfigured && <Button type="button" disabled={busy} onClick={() => void clear()}>Webhookを削除</Button>}
          </div>
        </form>
      )}
    </main>
  );
}
