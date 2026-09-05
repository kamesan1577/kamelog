# kamelog

ブログ・つぶやき・短いvlogをひとつのタイムラインにまとめる、個人サイト向けWebアプリです。現在はUIモックの段階です。

## 現在できること

- 未ログイン時は静的な個人サイトとして閲覧
- ブログ・つぶやき・vlogの混在タイムライン
- PCとスマートフォンに最適化したレスポンシブ表示
- 投稿検索、種類・タグによる絞り込み
- Markdownブログエディタとプレビュー
- つぶやき・ブログの下書き保護
- 16:9の短尺vlog撮影、動画選択、時刻・キャプション表示
- ブラウザ内での投稿・編集・削除・固定・プロフィール変更

## 起動

```bash
npm ci
npm run dev
```

ビルドとテスト:

```bash
npm test
```

## 現在の制約

データはブラウザのローカルストレージにのみ保存されます。認証、永続化API、動画変換、バックアップ、自宅サーバー向けデプロイ構成は今後実装します。進行中の作業はGitHub Issuesで管理します。

## UIの出典

[notion-kit](https://github.com/steeeee0223/notion-kit) のMITライセンスコードを一部コピー・調整しています。原文とライセンスは `vendor/notion-ui` に保持しています。ダイアログ、タブ、メニューなどにはRadix UI / shadcn/ui由来のコンポーネントも使用しています。

サンプル動画はMDNの[CC0動画](https://github.com/mdn/interactive-examples/blob/main/live-examples/media/cc0-videos/flower.mp4)です。

## プライバシー

リポジトリ内の表示名、プロフィール、投稿、リンクはすべて架空のサンプルです。実在する人物の個人情報をfixtureやplaceholderへ入れない方針です。
