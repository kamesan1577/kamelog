# kamelog handoff

## 入口

`AGENTS.md` → `spec/invariants/` → `spec/current/` → 関連ADR → テスト/実装の順に読む。
Issueは作業追跡に限り、チャット内容を読む必要はない。

## 現在の実装

- 承認済みメインUIのCSS checksumとPC/スマホ構造を契約テストで固定。
- 未ログイン表示とオーナー操作を分離し、WebAuthnパスキーを実署名検証。
- 投稿・下書き・プロフィールをSQLite、vlogを同一永続volumeへ保存。
- vlogをFFmpegで実際に1280x720、2/5/10/30秒へ変換。
- PCのインラインつぶやき、投稿ショートカット、モーダル内下書き復元、モバイル操作性を実装。
- PCホームの画像添付は現在のつぶやきへ媒体を加える独立行に分け、ブログ・つぶやき・vlogの投稿種別操作と視覚的に区別する。
- 投稿モーダルは最初のテキスト入力欄へ初期フォーカスする。スマホの投稿入力欄は16px以上を維持し、iOS系ブラウザのフォーカス時自動ズームを誘発しない。
- スマホのブログMarkdownツールバーは記法列だけを横スクロールさせ、ヘルプとプレビュー操作を投稿モーダル内に保持する。
- 10秒以下vlogの無音ループと即時停止、リンクコピー/X共有、投稿別OGP画像を実装。
- 投稿詳細の `?post=` と画面状態をHistory APIで同期し、詳細内の「戻る」、ブラウザの戻る/進む、ホーム等のナビゲーションでURLと表示が食い違わないようにする。直接共有URLから開いた詳細の「戻る」はホームへ戻す。
- ブログ詳細のいいね・リンクコピー・X共有は読書中も追従する。1000px以上では本文左側の縦型sticky rail、999px以下では下部floating bar、640px以下ではモバイルナビの上へ固定する。タイムライン側の操作は維持する。
- `robots.txt` / 動的sitemap / canonical / OGP・Twitter URL / WebSite・Person・BlogPosting JSON-LDを公開originへ統一し、本番メタデータへlocalhostを出さない。sitemapはホームと公開ブログだけを列挙し、存在しない投稿詳細は404にする。
- revision競合、Origin/CSRF、入力上限、媒体Range、rate limitをAPIで処理。
- DB/媒体のhash manifest付きbackup/restoreと全パスキー喪失時のoffline reset。
- Node 24の非root本番image、開発Compose、CIのcheck/e2e/container job。
- 成功済みmain CIだけを取得するpull型自動deploy、停止backup、health、コードrollback、systemd boot起動。
- 自動deployは整合backup後に直前releaseを再開してから新imageをbuildし、build中の公開停止を避ける。
- ブログMarkdownはCommonMark/GFMを表示し、記法ツールバー、全記法ヘルプ、言語指定コードのシンタックスハイライトを提供する。パースは `react-markdown` / `remark-gfm`、ハイライトは `rehype-highlight` / `highlight.js` に任せ、生HTMLは無効のまま維持する。
- ブログ詳細は描画済みの `h2`〜`h6` から本文直前へ目次を自動生成する。記事タイトルの `h1` は除外し、同名見出しには一意なアンカーを割り当てる。目次操作では投稿詳細のURL履歴を増やさない。
- ブログ本文への画像D&Dと画像追加ボタン、Mermaidコードブロック、単独行のYouTube/X投稿URL埋め込みを実装。つぶやきは画像のみを含め最大4枚をD&D/選択でき、1〜4枚グリッドと拡大表示を提供する。
- ブログ本文とつぶやき入力欄へのクリップボード画像貼り付けを画像アップロードへ接続。D&D・画像追加ボタン・貼り付けの静止画はブラウザ側で長辺2560px以下のWebPへ最適化し、変換で大きくなる画像とGIFは元ファイルを使う。
- ブログ投稿は既存モーダルからフルページ編集へ切り替え可能。編集・リアルタイムプレビュー・左右分割を切り替え、狭い画面では分割ペインを上下に配置する。
- ブログは初回公開日時を保持し、公開後のタイトル/本文編集時だけ最終更新日時を保存して公開表示する。固定/解除では最終更新日時を動かさない。
- AGENTS、仕様、不変条件、ADR、脅威モデル、runbook、リポジトリ固有skillsを整備。
- 公開プロフィールは `@kamesan1577`、公開リンクはGitHubとQiitaを表示する。投稿・下書き・設定の実データは初期化しない。
- インデックスはサイト紹介、公開プロフィール、3種のコンテンツ、プロジェクト、公開投稿から選ぶ人気投稿1件を表示し、投稿一覧は独立したタイムラインとして提供する。
- インデックスは2021年の情報系大学入学と2025年の卒業・エンタメ系企業入社を経歴として表示する。人気投稿は投稿詳細の閲覧回数で選び、同一タブの再表示を重複加算しない。サーバーは投稿別合計だけを保存する。

## 検証済み

- ローカル `make check`: public-repo check、UI契約、型、lint、unit/API/media/backup test、本番build。
- 実FFmpegによる縦動画fixtureの16:9変換。
- 不正WebAuthn応答、未ログイン書込、Origin不一致、revision競合、破損backup拒否。
- GitHub Actions run #52（commit `ed946978372062b7db871617a91959005ac66ea9`）の `check` / `e2e` / `container` がすべて成功。
- Playwright Chromiumで匿名表示、PC/スマホ、仮想パスキー、下書き保護・復元、投稿永続化、Markdown無害化、再ログイン、実動画vlog投稿を確認。
- 本番Docker imageの非root起動、health、再起動後のデータ永続、Compose構文、開発image buildを確認。
- production dependency auditはhigh以上0件。
- 2026-09-07 Markdown変更後、Node 24・FFmpeg環境の `make check`、Playwright Chromiumの全E2E、CI `container` 相当（Compose構文、本番/開発image build、非root、health、再起動後永続）が成功。production dependency auditは0件。
- GitHub Actions run #34073823834（commit `ec5f3994`）の `check` / `e2e` / `container` がすべて成功。
- 2026-09-07 画像・埋め込み変更後、`make check`（画像magic/寸法、未公開媒体、4枚上限、Markdown埋め込み、型、lint、本番buildを含む）が成功し、production dependency auditは0件。ローカルE2EはPlaywright Chromium配布元の502/timeoutでブラウザを取得できず未実施。PRのCI `e2e` で確認する。
- 2026-09-07 Issue #37のブログ全画面・分割エディタ変更後、`make check`（公開検査、UI契約、型、lint、unit、本番buildを含む）が成功。ローカルE2Eは実行環境にChromiumがなく、Playwright配布元からの取得がtimeoutしたため未実施。追加したPC分割配置・リアルタイム反映と既存のPC/390px journeyはPRのCI `e2e` で確認する。
- 2026-09-07 投稿詳細履歴変更では、実行環境からGitHubをcheckoutできないためローカル `make check` / `make e2e` は未実施。追加した投稿詳細URL・アプリ内戻る・ブラウザ戻る/進む・直接共有URLの回帰はPRのCI `check` / `e2e` / `container` で確認する。
- 2026-09-08 Issue #41の追従アクション変更は、CSS契約テストと1280px/390pxのPlaywright回帰で、PCの左sticky railとスマホの下部floating barがスクロール後も同位置に残ることをPR CIで確認する。
- 2026-09-07 Issue #45のトップページ変更後、`make check`（公開検査、UI契約、型、lint、unit、本番buildを含む）が成功。PCと390pxの匿名表示を実ブラウザで目視し、横方向の見切れがないことを確認した。ローカルE2Eは実行環境にPlaywright Chromiumがないため未実施し、トップからタイムラインへの導線を含むjourneyはPRのCI `e2e` で確認する。
- 2026-09-08 Issue #45のデザイン修正では、利用者の指示に従い大きなコピー、状態表示風の装飾、走査アニメーション、過剰な影と引用表現を削除した。`make check`が成功し、PCと390pxの匿名表示を実ブラウザで確認した。ローカルE2E用Chromiumは取得がtimeoutしたため、更新したjourneyはPRのCI `e2e` で確認する。
- 2026-09-08 Issue #45の経歴・閲覧数変更では、既存DBへの追加migration、閲覧数の永続・復元・投稿削除時消去、同一Origin拒否、公開API、閲覧数による人気投稿選択をunit/E2Eへ追加し、`make check`が成功した。PCと390pxの匿名表示を実ブラウザで確認した。ローカル `make e2e` はPlaywright Chromiumが未導入で起動前に失敗したため、PRのCI `e2e` で確認する。
- 2026-09-08 Issue #14 SEO変更では、実行環境からGitHubをcheckoutできないためローカル `make check` / `make e2e` は未実施。canonical・JSON-LD・robots・sitemap・404の回帰をunit/E2Eへ追加し、PRのCI `check` / `e2e` / `container` で確認する。公開環境の性能値はデプロイ後に `runbooks/seo.md` で再計測する。

## 対象サーバーでのみ完了できる項目

- 実ドメインとTLS reverse proxy。
- 実機iOS/Androidでのパスキー、投稿モーダル初期フォーカス・ソフトウェアキーボード・フォーカス時自動ズームなし、横向き撮影、既存動画upload。
- 永続volumeから別ディレクトリへの復元訓練とオフホスト暗号化backup。
- GitHub required checks `check` / `e2e` / `container` の有効化。
- 対象ホストへのsystemd unit導入、初回timer実行、Cloudflare Tunnelを含む再起動試験。
- SEO変更後の公開originでmobile / desktop LighthouseとCrUX INP、公開/直結TTFBを再計測する。

## 既知の制約

- 単一ホスト・単一writer向けで水平スケールは対象外。
- 投稿に紐付く前の孤児媒体は自動削除しない。容量監視し、GC実装前はDBを迂回して消さない。
- main UIの正式な変更は利用者の明示承認とUI baseline更新を必要とする。
- 自動deployはコードrollbackのみ。非互換DB migrationはbackupから別volumeへ手動復元する。
- deploy script/unitはroot領域の固定コピーであり、リポジトリ更新だけでは置換されない。

本番可否は `runbooks/deployment.md` の全項目で判定する。未実施項目を成功扱いしない。
