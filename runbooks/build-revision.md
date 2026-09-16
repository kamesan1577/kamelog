# ビルドSHAの表示と配布

サイトのフッターに表示するSHAは、実際の稼働イメージをbuildした時点の値。`KAMELOG_BUILD_SHA` はDockerのbuild argumentであり、永続的な `.env` やサーバー環境変数へ追加する必要はない。未設定・不正値の場合は誤表示を防ぐためフッターのBuild欄を隠す。

## 自動更新

`ops/kamelog-update` はCI成功済み `remote_sha` を `KAMELOG_BUILD_SHA` としてComposeのbuildへ一時的に渡す。Dockerfileはbuild/runtime両stageで値を受け取り、完成イメージに固定する。blue/greenは同じimageを使用する。ロールバック時は旧imageに戻るため、表示も旧SHAへ戻る。

**既存ホストの `/usr/local/sbin/kamelog-update` はroot所有の固定コピーであり、Git更新だけでは置き換わらない。** 今回の変更を本番へ適用する際は `runbooks/deployment.md` の手順に従い、レビュー後に更新済み `ops/kamelog-update` を再設置してから更新timerを再開する。既存の実データ・volume・envを変更しない。

## 初回起動・手動ビルド

`git rev-parse HEAD` が指すcommitをbuildに明示的に渡す。例（本番checkout内、既存のenvファイルを利用する場合）：

```sh
KAMELOG_BUILD_SHA="$(git rev-parse HEAD)" docker compose --env-file /etc/kamelog/env -f compose.yaml up --build -d
```

通常の自動更新には上記コマンドは不要。ローカルの `npm run dev` ではSHA未設定のままでよい。`main` の最新SHAをブラウザで取得して表示する方式は使用しない。
