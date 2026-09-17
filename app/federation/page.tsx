import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getStore } from "@/server/runtime.mjs";
import { siteOrigin } from "@/server/seo.mjs";
import styles from "@/components/design-system/patterns/FederationGuide.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fediverse | kamelog",
  description: "kamelogのActivityPub対応範囲と相互接続方法。",
  alternates: { canonical: "/federation" },
  openGraph: {
    title: "Fediverse | kamelog",
    description: "kamelogのActivityPub対応範囲と相互接続方法。",
    siteName: "kamelog",
    type: "website",
    url: "/federation",
  },
};

const inbound = [
  ["Follow / Accept / Undo", "対応"],
  ["Create / Update / Delete", "Noteに対応"],
  ["Announce / Undo", "RPとして対応"],
  ["Like / EmojiReact / Undo", "いいねとして集約"],
  ["Reply / DM", "非対応"],
] as const;

const outbound = [
  ["Follow / Undo", "対応"],
  ["Create / Update / Delete", "つぶやき・ブログに対応"],
  ["Announce / Undo", "RPとして対応"],
  ["Like / Reply / DM", "非対応"],
] as const;

export default function FederationGuidePage() {
  const identity = getStore().federationIdentity();
  const origin = siteOrigin();
  const host = new URL(origin).host;
  const handle = identity ? `@${identity.username}@${host}` : null;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/">
          <ArrowLeft size={16} />
          kamelogへ戻る
        </Link>

        <header className={styles.hero}>
          <p className={styles.eyebrow}>Fediverse</p>
          <h1>ActivityPubに対応しています</h1>
          <p>
            kamelogの公開投稿は、MastodonやMisskeyなどのActivityPub対応サービスからフォローできます。
            特別なkamelogアカウントや接続申請は必要ありません。
          </p>
          {handle && (
            <div className={styles.handle}>
              <span>Fediverseアドレス</span>
              <strong>{handle}</strong>
            </div>
          )}
        </header>

        <section className={styles.section}>
          <h2>接続するには</h2>
          <p>
            ActivityPubの標準的な連合機能を使います。WebFingerでActorを解決し、HTTP署名付きでinboxへ配送してください。
          </p>
          <ol className={styles.steps}>
            <li>
              <span>1</span>
              <div>
                <strong>WebFingerで検索</strong>
                <p>
                  有効化済みのFediverseアドレスをacct形式の識別子として検索します。
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Actorを取得</strong>
                <p>Actor文書のinbox、outbox、公開鍵を利用します。</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>通常のActivityPubとして連合</strong>
                <p>Follow、Accept、公開Noteを標準activityで交換します。</p>
              </div>
            </li>
          </ol>
        </section>

        <section className={styles.section}>
          <h2>対応範囲</h2>
          <div className={styles.matrices}>
            <SupportTable title="受信" rows={inbound} />
            <SupportTable title="送信" rows={outbound} />
          </div>
          <p className={styles.note}>
            ブログは互換性を優先し、タイトル、概要、元記事URLを含むNoteとして配信します。vlogと外部動画の完全なproxy配信には対応しません。
          </p>
        </section>

        <section className={styles.section}>
          <h2>公開エンドポイント</h2>
          <div className={styles.endpoints}>
            <code>GET /.well-known/webfinger</code>
            <code>GET /activitypub/actor</code>
            <code>POST /activitypub/inbox</code>
            <code>GET /activitypub/outbox</code>
            <code>GET /activitypub/followers</code>
            <code>GET /activitypub/following</code>
          </div>
          <p className={styles.note}>
            server間通信にはHTTPS、HTTP署名、Digestが必要です。kamelog独自の連合プロトコルはありません。
          </p>
        </section>

        <footer className={styles.footer}>
          <a
            href="https://www.w3.org/TR/activitypub/"
            target="_blank"
            rel="noreferrer"
          >
            W3C ActivityPub仕様
            <ArrowUpRight size={14} />
          </a>
          <a
            href="https://github.com/kamesan1577/kamelog/issues/new"
            target="_blank"
            rel="noreferrer"
          >
            接続上の問題を報告
            <ArrowUpRight size={14} />
          </a>
        </footer>
      </div>
    </main>
  );
}

function SupportTable({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <div className={styles.matrix}>
      <h3>{title}</h3>
      <dl>
        {rows.map(([name, support]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>{support}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
