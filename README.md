# kamelog

ブログ・つぶやき・短いvlogをひとつのタイムラインにまとめる、単一オーナー向けの個人サイトです。
未ログイン時は投稿やアカウント操作を出さない公開サイトとして動き、オーナーだけが折り畳まれた入口からパスキーでログインします。

## 機能

- ブログ・つぶやき・vlogの混在タイムライン
- PC/スマートフォン向けレスポンシブUIとホーム内検索
- Markdownブログ、つぶやき、閉じる前に確認するサーバー下書き
- 撮影または選択した動画を16:9へ変換する2/5/10/30秒vlog
- WebAuthnパスキーによる単一オーナー認証
- SQLiteとローカル媒体ディレクトリへの永続化
- 整合性manifest付きbackup/restoreと認証復旧CLI
- 非rootのDocker Compose構成

## 開発

Node.js 24、FFmpegを使用します。

```bash
cp .env.example .env.local
npm ci
npm run dev
```

`http://localhost:3000` が公開画面です。
開発時だけ `?preview=1` でPC/スマホ疑似切替を表示できます。
初回のパスキー登録には、32文字以上のランダムな `KAMELOG_BOOTSTRAP_TOKEN` をGit外で設定して `/setup` を開きます。

すべてのローカル品質ゲートは次の1コマンドです。

```bash
make check
```

ブラウザjourneyとDocker検証は次のコマンドで実行します。

```bash
npx playwright install chromium
make e2e
docker compose build
```

## 本番運用

```bash
KAMELOG_ORIGIN=https://example.test docker compose up --build -d
```

Composeはアプリを `127.0.0.1:3000` のみに公開します。
TLS終端、公開ドメイン、upload制限、backup schedulerはホスト側で設定してください。
初回登録後はbootstrap tokenを環境から削除し、予備パスキーを登録します。

本番へ出す前の必須確認、更新、backup、復旧は [runbooks/deployment.md](runbooks/deployment.md) にあります。
特に実機iOS/Androidのパスキー・録画確認と復元訓練は、対象サーバーで別途必要です。

## 開発ハーネス

チャット履歴に依存せず作業できるよう、読む順番と正本を分離しています。

1. [AGENTS.md](AGENTS.md)
2. [spec/invariants/README.md](spec/invariants/README.md)
3. [spec/current/README.md](spec/current/README.md)
4. 関連する [adr/](adr/) とテスト
5. [HANDOFF.md](HANDOFF.md)

Issueは進捗の索引であり、仕様や開発ルールの正本ではありません。
UI変更とデータ安全性の反復作業には `.codex/skills/` のリポジトリ固有skillを使います。

## セキュリティとプライバシー

公開リポジトリ向け検査は、秘密値らしい文字列、runtime data、私的マーカー、コミット名義を検査します。

```bash
npm run check:public
```

実投稿・下書き・プロフィール・動画・DB・tokenをIssue、PR、CI成果物へ入れないでください。
脆弱性の報告方針は [SECURITY.md](SECURITY.md)、境界と脅威は [docs/security/threat-model.md](docs/security/threat-model.md) を参照してください。

## UIの出典

[notion-kit](https://github.com/steeeee0223/notion-kit) のMITライセンスコードを一部コピー・調整しています。
原文とライセンスは `vendor/notion-ui` に保持しています。
ダイアログ、タブ、メニューなどにはRadix UI / shadcn/ui由来のコンポーネントも使用しています。
サンプル動画はMDNの[CC0動画](https://github.com/mdn/interactive-examples/blob/main/live-examples/media/cc0-videos/flower.mp4)です。

## ライセンス

このリポジトリ固有のコードは [MIT License](LICENSE) です。
依存物・vendored code・媒体にはそれぞれのライセンスが適用されます。
