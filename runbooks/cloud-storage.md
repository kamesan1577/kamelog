# Cloudflare保存先の運用

Cloudflareへ移行する場合も、Next.jsとFFmpegは現在のサーバーで動かす。
DBにはSQLite-backed Durable Objects、媒体にはR2 Standardを使用する。
移行前のローカルDBと媒体は自動削除しない。

## 接続設定

CloudflareのWorkers Freeと非公開のR2 Standard bucketを用意する。
`npm ci`で固定版Wranglerを導入し、`npx wrangler login --device`で本人認証する。
設定ファイル`cloudflare/wrangler.jsonc`のbucket名を接続先と合わせ、同ファイルを指定してstorage Workerをデプロイする。
公開bucketやR2の開発用公開URLを有効にしない。

Workerのsecret `STORAGE_TOKEN`に32文字以上のランダムな値を設定する。
同じ値をサーバー側の`KAMELOG_STORAGE_TOKEN`へ設定し、`KAMELOG_STORAGE_ENDPOINT`にデプロイしたWorkerのHTTPS originを設定する。
トークンはGit、チャット、ログ、コマンド引数へ書かず、秘密値を管理する仕組みから渡す。
既存の`KAMELOG_INFERENCE_ENCRYPTION_KEY`は同じ値を維持する。

接続先の世代は移行CLIが生成し、ローカルの`storage.json`に記録する。
このファイルを手作業で先に作って移行を省略しない。
アプリ、federation worker、管理CLIは同じ保存先ディレクトリと接続設定を参照する。

## 無料枠と容量上限

2026-11-02時点の[Durable Objectsの料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)と[R2の料金](https://developers.cloudflare.com/r2/pricing/)を導入時に確認する。
Workers FreeのSQLite保存はアカウント合計5GBで、日次の読み書き、リクエスト、実行時間にも制限がある。
R2 Standardには月10GB-month、Class Aが100万回、Class Bが1,000万回の無料枠がある。

Workerの`MAX_STORAGE_BYTES`は媒体の新規保存を止める容量上限で、初期値は9,000,000,000 bytesとする。
このWorkerが追跡する全世代の媒体を合算するが、他のbucketや手動アップロードを含むアカウント全体の課金上限ではない。
移行後に古い世代を残す場合や別サービスでもR2を利用する場合は、合計使用量を確認する。
クラウドの配送待機は15秒、Composeのhealth間隔は既定30秒とし、空のpollによる無料枠の消費を抑える。
投稿一覧の取得は全件走査を含むため、大量投稿時は保存容量だけでなく読み取り行数も監視する。
R2の無料枠を超えた利用には課金があるため、支払額0円を運用上の目標とする場合は保存量と操作回数を監視する。

## 既存データの一括移行

同じ保存先へ書き込むアプリ、federation worker、定期ジョブ、自動更新を停止する。
書き込み停止に対応したコードがすべてのプロセスへ導入されていることを確認する。
CLIの`--stopped`は停止済みであることの確認であり、プロセスを自動停止するオプションではない。

```sh
node scripts/migrate-storage.ts migrate /var/lib/kamelog-data /var/backups/kamelog/cloud-migration --stopped
```

バックアップ先は元データの外に置く空ディレクトリを指定する。
CLIは停止の印を置き、整合バックアップ、DBと媒体の転送、移行先の全件照合を行う。
成功した場合だけ保存先をatomic renameで切り替える。
完了後、接続設定を持つアプリとworkerを再起動し、ログイン、既存投稿、下書き、画像、動画、新規投稿を確認する。

中断した場合は同じ引数で再実行する。
移行IDと世代を再利用し、検証済みバックアップから再開する。
失敗中は書き込み停止を維持するため、ローカル保存へ戻して再開する場合は次を実行する。

```sh
node scripts/migrate-storage.ts cancel /var/lib/kamelog-data --stopped
```

取り消しは切り替え前だけに限る。
元データとバックアップを保持し、クラウドの作業中データも自動削除しない。
切り替え後に`storage.json`を削除して旧DBへ戻すと、その後の投稿を失うため、最新のクラウドデータを出力して復元する。

## 出力とローカルへの復元

クラウドを利用中の保存先から、最新のSQLiteと媒体を取得する。
出力中は一貫した内容を得るためクラウド側でも書き込みを止める。
停止には5分の期限があり、正しい移行IDでページを取得するたびに更新する。
処理が強制終了した場合は期限後に投稿を再開でき、未完了の出力を有効なバックアップとして扱わない。

```sh
node scripts/migrate-storage.ts export /var/lib/kamelog-data /var/backups/kamelog/cloud-export --stopped
node scripts/migrate-storage.ts verify /var/backups/kamelog/cloud-export
node scripts/migrate-storage.ts restore /var/backups/kamelog/cloud-export /var/lib/kamelog-restored --stopped
```

復元先は空ディレクトリに限る。
ハッシュと参照の検証が成功してから、アプリの保存先を復元ディレクトリへ変更して再起動する。
パスキーのOriginとRP IDを保ち、暗号化済み資格情報を復号する既存の環境鍵を維持する。
バックアップには秘密鍵と非公開データを含むため、権限を限定し、オフホストへ置く場合は暗号化する。

## 投稿時の失敗

`storage_limit`は保存サービスの利用上限を示す。
容量または利用枠の回復後に再試行し、入力を破棄しない。
`storage_unavailable`は確定結果を確認できない場合も含むため、再送前に投稿一覧を確認する。
上流の応答や秘密値を公開ログへ貼らず、固定エラーコードと発生操作だけを記録する。

実Cloudflareでの起動と復元試験、CI、本番の移行結果は`HANDOFF.md`に確認済みと未確認を分けて記録する。
