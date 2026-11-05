# Cloudflare保存先の運用

Cloudflareへ移行する場合も、Next.jsとFFmpegは現在のサーバーで動かす。
DBと媒体の両方にSQLite-backed Durable Objectsを使用する。
Workers Freeだけを利用し、R2の従量課金契約とWorkers Paidを有効化しない。
移行前のローカルDBと媒体は自動削除しない。

## 接続設定

CloudflareアカウントがWorkers Freeであり、既存のDurable Objects使用量に余裕があることを確認する。
`npm ci`で固定版Wranglerを導入し、`npx wrangler login --device`で本人認証する。
`cloudflare/wrangler.jsonc`を指定してstorage Workerをデプロイする。
DB用のSTORAGEと媒体用のMEDIAはどちらも非公開のSQLite Durable Object bindingであり、bucketは作成しない。
既存同名Workerがある場合は所有と用途を確認し、無条件で上書きしない。

Workerのsecret `STORAGE_TOKEN`に32文字以上のランダムな値を設定する。
同じ値をサーバー側の`KAMELOG_STORAGE_TOKEN`へ設定し、`KAMELOG_STORAGE_ENDPOINT`にデプロイしたWorkerのHTTPS originを設定する。
トークンはGit、チャット、ログ、コマンド引数へ書かず、秘密値を管理する仕組みから渡す。
既存の`KAMELOG_INFERENCE_ENCRYPTION_KEY`は同じ値を維持する。

接続先の世代は移行CLIが生成し、ローカルの`storage.json`に記録する。
このファイルを手作業で先に作って移行を省略しない。
アプリ、federation worker、管理CLIは同じ保存先ディレクトリと接続設定を参照する。

## 無料枠と容量上限

2026-11-02時点の[Durable Objectsの料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[DOの制限](https://developers.cloudflare.com/durable-objects/platform/limits/)、[Workersの制限](https://developers.cloudflare.com/workers/platform/limits/)を導入時に確認する。
Workers FreeのSQLite保存はアカウント合計5GB、単体Objectは安全側に1GBを上限として設計する。
日次のSQL読み取りは500万行、書き込みは10万行、DOのリクエストは10万回、実行時間は13,000 GB-sまでとし、Workers入口にも10万回/日の制限がある。
超過した操作は失敗する。日次枠はUTC 00:00（日本時間09:00）にリセットする。
有料プランへ変更せず、保存失敗の日本語メッセージと入力保持で対応する。

媒体は1ファイルにつき1つのObjectへ保存し、最大64MiBのファイルを1MiB以下のSQL BLOB行に分割する。
元のファイル内容とURLを変えず、メタデータと全チャンクを原子的に確定する。
`MAX_STORAGE_BYTES`は媒体の新規保存を止める容量上限で、初期値は3,000,000,000 bytesとする。
このWorkerが追跡する全世代の媒体を合算するが、DBや他のWorker、SQLite管理領域の容量は含まない。
アカウントの5GBにはそれらも含まれるため、実使用量を確認して余裕を確保する。
古い世代と移行途中の予約も容量を消費し、原本を保持したまま安易に世代を作り直さない。
クラウドの配送待機は15秒でheartbeatとclaimを1 RPCにまとめる。Composeのhealth間隔は既定30秒で、アプリと配送workerのlivenessはDBを読まない。更新時の保存先確認は`/api/ready`を使う。
投稿一覧には全件走査が含まれるため、10万投稿でも無料枠内での継続利用を保証しない。
初回移行が日次枠へ達した場合は切り替えず、停止と原本を保持したまま同じ移行IDで翌日以降に再開する。

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

## 読み取り上限の切り分け（Issue #308）

1. Cloudflare DashboardのDurable ObjectsでStorageObject、MediaObject、同一アカウントの他namespaceを分ける。
   日次枠と揃えるため、UTC 00:00〜翌日00:00を指定してrowsRead・rowsWritten・requests・errorsを記録する。
   「最後の24時間」や「ストレージ操作」の合計をrowsRead単独と同一視しない。
2. 必要な期間だけWorker変数`STORAGE_DIAGNOSTICS=true`を設定し、運用で使うログ取得方法（例: `wrangler tail`）を用意する。
   保存済みログを使う場合はobservabilityも明示的に有効化する。リポジトリの既定は無効。
   認証済みRPCには`X-Storage-Sql-Count`・`X-Storage-Rows-Read`・`X-Storage-Rows-Written`も付く。
   診断結果は操作名と数値のみで、SQLや本文・引数は出さない。調査後は診断モードを無効化する。
3. 公開一覧、個別投稿、画像の認可、sitemap、`command:pollFederation`、移行・出力の実行時間帯を分けて確認する。
   現行の詳細SQL計測はDBのRPCが対象。MediaObjectの実読み取りとmigration/exportはnamespaceメトリクスで確認する。
   `EXPLAIN QUERY PLAN`は架空データの検証環境で実行し、主キー・媒体参照・配送待機・ブログ種別・Federation順序の索引を確認する。
4. 修正前後で24時間の無操作・配送なしの期間を設け、同じUTC日境界でrequestsとrowsReadを記録する。
   ローカルworkerdのテスト値と本番の実測値を区別する。公開閲覧・配送・定期バックアップがあった期間はその条件も残す。

本修正のローカルworkerd実測（架空投稿、各投稿にタグ1個、先頭投稿に公開媒体1個、同数の完了済み配送履歴、ウォーム状態、gatewayメタデータ読み取りを含む）:

| 投稿数 | 一覧 SQL / rowsRead | 詳細 rowsRead | 媒体認可 rowsRead | 空の配送poll rowsRead |
| -----: | ------------------: | ------------: | ----------------: | --------------------: |
|      0 |               4 / 4 |             1 |                 1 |                     6 |
|     10 |              4 / 22 |             5 |                 2 |                     6 |
|    100 |             4 / 202 |             5 |                 2 |                     6 |
|   1000 |            4 / 2002 |             5 |                 2 |                     6 |

媒体認可は0件時に下書きだけが参照するID、それ以外は公開投稿が参照するIDの照会であり、媒体BLOB本体の取得行数は含まない。
一覧はドメイン内の3 SQLとgatewayの世代確認1 SQLで、タグ数に応じて読み取り行数が増える。
常駐呼び出しは、blue/green/workerが各30秒監視・配送なし・正常稼働と仮定すると、従来の少なくとも20,160回/日から配送pollの5,760回/日になる計算（約71%減）。
これは設計上の概算であり、本番24時間実測ではない。

上限に達したらPaid/R2へ変更せず、まずバックアップ・移行・定期ジョブの実行状況とnamespace別の内訳を確認する。
手動再試行を連続で行わず、投稿入力を保持する。
配送workerは保存先エラー時に最大5分の指数待機を行うので、livenessが正常でも配送診断のheartbeatが古い場合は保存先を確認する。
UTC 00:00のリセット後、`/api/ready`、投稿閲覧、ログイン、下書き、公開/非公開媒体、配送を確認する。
古いローカルDBへ保存先を戻さない。

スキーマ13への更新では既存投稿の媒体参照を初回だけ走査する。
アプリとstorage Workerを対応する版へ揃え、初回更新前に整合バックアップと無料枠の余裕を確保する。
本番デプロイ・実データの更新は明示的な承認後に実施する。

スキーマ13への更新後にアプリを戻す場合も、storage Workerはスキーマ13対応版を維持する。
旧storage Workerはスキーマ13を扱えないため、両者を無条件に前版へ戻さない。
ホストの固定`kamelog-update`はリポジトリ更新だけで置き換わらないため、readinessを使う版の設置も運用作業に含める。
