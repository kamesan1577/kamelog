# ビルドSHAの表示と配布

サイトのフッターに表示するSHAは、実際の稼働イメージをbuildした時点の値。`KAMELOG_BUILD_SHA` はDockerのbuild argumentであり、永続的な `.env` やサーバー環境変数へ追加する必要はない。未設定・不正値の場合は誤表示を防ぐためフッターのBuild欄を隠す。

## 自動更新

`ops/kamelog-update` はCI成功済み `remote_sha` を `KAMELOG_BUILD_SHA` としてComposeのbuildへ一時的に渡す。Dockerfileはbuild/runtime両stageで値を受け取り、完成イメージに固定する。blue/greenは同じimageを使用する。ロールバック時は旧imageに戻るため、表示も旧SHAへ戻る。

更新前のバックアップは**稼働中の旧イメージ**のCLIで実行する。移行期間中は `scripts/admin.ts` と `scripts/admin.mjs` の実在をコンテナ内で判定し、どちらもなければ切替前に停止する。workerの検証は、異なるリリースのCLIファイル名に依存しないDockerのhealth statusを用いる。失敗した場合は旧commitへ戻してから旧imageを再タグ付けし、旧Composeでblue/greenとworkerを復元・検証する。

更新前に空きが10GiB未満なら未使用のビルドキャッシュを容量上限8GBで整理し、まだ不足する場合はデプロイを中止する。正常な更新後も同様にキャッシュを整理し、`kamelog-app:rollback` で直前のイメージを保持する。以前のrollbackイメージだけを使用状況を確認しながら削除する。Docker volumeや無関係なイメージは削除しない。

## 固定されたホストスクリプトからの初回移行

**既存ホストの `/usr/local/sbin/kamelog-update` はroot所有の固定コピーであり、Git更新だけでは置き換わらない。** 今回の修正を本番へ反映するときは、PRをマージし、対象commitのpush CI成功を確認した後に次を実行する。現行のcheckoutや稼働中のアプリを先に変更しないこと。

```sh
cd /home/kamesan/services/kamelog
sudo systemctl stop kamelog-update.timer
git fetch origin main
tmp=$(mktemp)
git show FETCH_HEAD:ops/kamelog-update > "$tmp"
bash -n "$tmp"
sudo cp -a /usr/local/sbin/kamelog-update "/usr/local/sbin/kamelog-update.backup-$(date +%Y%m%d-%H%M%S)"
sudo install -o root -g root -m 0755 "$tmp" /usr/local/sbin/kamelog-update
rm -f "$tmp"
sudo systemctl start kamelog-update.service
sudo systemctl show kamelog-update.service -p Result -p ExecMainStatus
sudo journalctl -u kamelog-update.service -n 60 --no-pager
```

`Result=success`、`deployment completed: <対象SHA>`、公開HTMLのフッター、blue/green/workerのhealthを確認してから `sudo systemctl start kamelog-update.timer` で自動更新を再開する。失敗した場合はtimerを停止したままログを調査する。作業中に `git pull`、`docker compose down -v`、バックアップの上書きはしない。

将来root所有のデプロイスクリプトを変更した場合も、レビュー済みのコードを明示的に再設置する。新しいスクリプトが旧イメージを操作する前提を維持し、移行テストを通してから適用する。

## 初回起動・手動ビルド

`git rev-parse HEAD` が指すcommitをbuildに明示的に渡す。例（本番checkout内、既存のenvファイルを利用する場合）：

```sh
KAMELOG_BUILD_SHA="$(git rev-parse HEAD)" docker compose --env-file /etc/kamelog/env -f compose.yaml up --build -d
```

通常の自動更新には上記コマンドは不要。ローカルの `npm run dev` ではSHA未設定のままでよい。`main` の最新SHAをブラウザで取得して表示する方式は使用しない。
