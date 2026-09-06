# kamelog handoff

## 入口

`AGENTS.md` → `spec/invariants/` → `spec/current/` → 関連ADR → テスト/実装の順に読む。
Issueは作業追跡に限り、チャット内容を読む必要はない。

## 現在の実装

- 承認済みメインUIのCSS checksumとPC/スマホ構造を契約テストで固定。
- 未ログイン表示とオーナー操作を分離し、WebAuthnパスキーを実署名検証。
- 投稿・下書き・プロフィールをSQLite、vlogを同一永続volumeへ保存。
- vlogをFFmpegで実際に1280x720、2/5/10/30秒へ変換。
- revision競合、Origin/CSRF、入力上限、媒体Range、rate limitをAPIで処理。
- DB/媒体のhash manifest付きbackup/restoreと全パスキー喪失時のoffline reset。
- Node 24の非root本番image、開発Compose、CIのcheck/e2e/container job。
- AGENTS、仕様、不変条件、ADR、脅威モデル、runbook、リポジトリ固有skillsを整備。

## 検証済み

- ローカル `make check`: public-repo check、UI契約、型、lint、unit/API/media/backup test、本番build。
- 実FFmpegによる縦動画fixtureの16:9変換。
- 不正WebAuthn応答、未ログイン書込、Origin不一致、revision競合、破損backup拒否。
- GitHub Actions run #52（commit `ed946978372062b7db871617a91959005ac66ea9`）の `check` / `e2e` / `container` がすべて成功。
- Playwright Chromiumで匿名表示、PC/スマホ、仮想パスキー、下書き保護・復元、投稿永続化、Markdown無害化、再ログイン、実動画vlog投稿を確認。
- 本番Docker imageの非root起動、health、再起動後のデータ永続、Compose構文、開発image buildを確認。
- production dependency auditはhigh以上0件。

## 対象サーバーでのみ完了できる項目

- 実ドメインとTLS reverse proxy。
- 実機iOS/Androidでのパスキー、横向き撮影、既存動画upload。
- 永続volumeから別ディレクトリへの復元訓練とオフホスト暗号化backup。
- GitHub required checks `check` / `e2e` / `container` の有効化。

## 既知の制約

- 単一ホスト・単一writer向けで水平スケールは対象外。
- 投稿に紐付く前の孤児媒体は自動削除しない。容量監視し、GC実装前はDBを迂回して消さない。
- main UIの正式な変更は利用者の明示承認とUI baseline更新を必要とする。

本番可否は `runbooks/deployment.md` の全項目で判定する。未実施項目を成功扱いしない。
