# デプロイ前と運用

## 公開ゲート

- [ ] clean checkoutからnpm ciとmake checkが成功
- [ ] CI check/e2e/containerが同じcommitで成功
- [ ] HTTPSで実機iOS/Androidパスキー登録・ログイン・録画・アップロード確認
- [ ] 別ディレクトリへバックアップ復元し、投稿と媒体を確認
- [ ] GitHubのrequired checksをcheck/e2e/containerに設定（権限保持者が実施）
- [ ] 固有ドメイン、data volume、bootstrap token、バックアップ先をGit外で設定
- [ ] reverse proxyのbody上限64MiB、ヘッダー/本文タイムアウト、TLSを設定
- [ ] 初回登録後bootstrap tokenを環境から削除し、予備パスキーを登録

チェックが未実施なら公開可と報告しない。未実施項目はHANDOFFへ残す。

## 初回起動

Node 24、Docker Compose、FFmpegを使用。
`KAMELOG_ORIGIN` に公開Originを設定する（例は https://example.test）。
bootstrap tokenは32文字以上の暗号学的乱数を管理環境で生成し、ログやコマンド履歴に出さず環境へ設定する。
`docker compose up --build -d` で起動し、HTTPS reverse proxyを127.0.0.1:3000へ接続する。
`/setup` でパスキーを登録する。通常の公開画面は `/`。
ログイン入口は折り畳みの「•••」。追加パスキーはログイン後 `/setup` から登録できる。

localhostだけで確認する場合は `KAMELOG_ORIGIN=http://localhost:3000` を使用できる。
公開ホストのHTTPはアプリが拒否する。実行プロセス/volumeは専用OSユーザーで管理する。

## 更新・ロールバック

更新前にアプリを停止しbackupを取得する。通常の停止で `down -v` を使わない。
更新imageを起動、healthと匿名閲覧・ログイン・投稿を確認する。
schema非互換変更時は古いimageだけに戻さず、更新前backupを空volumeへ復元する。
旧volumeは検証完了まで保持する。

## バックアップ

DBと媒体を同じ停止期間に取得する。停止せず取得する運用は現在サポートしない。
ホストで `node scripts/admin.mjs backup SOURCE_DATA EMPTY_BACKUP_DIR` を実行する。
復元: `node scripts/admin.mjs restore BACKUP_DIR EMPTY_DATA_DIR`。
既存の宛先には上書きできない。manifestを変更して検査を迂回しない。
日次の保守時間に停止→backup→起動をschedulerへ登録する。失敗時の通知も設定する。
日次30世代、月次の復元訓練を標準とする。自動削除は復元成功後に運用者が設定する。
バックアップは0700の場所に置き、オフホスト転送前に暗号化する。復号鍵は別保管する。

## 復旧

パスキーを全て失った場合は公開を止め、DBをバックアップする。
停止中に `node scripts/admin.mjs reset-auth SOURCE_DATA --confirm-reset-auth` を実行する。
新しい32文字以上のbootstrap tokenを環境へ設定して起動し、`/setup` から再登録する。
登録完了後はtokenを環境から削除し、再起動してログインを確認する。
この操作は全パスキー・session・未完了challengeを削除するが、投稿・下書き・媒体には触れない。
media内の未参照ファイルは容量を占有する。孤児媒体の自動GCは未実装のため、監視しても手作業で削除しない。
