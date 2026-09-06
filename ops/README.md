# Production operations

`kamelog-update` は、成功済みのmain CI commitだけを本番ホストへpullするdeploy script。
`systemd/` はアプリのboot起動と約5分ごとの更新確認を定義する。

導入、検証、rollback、backup、復旧の手順は [`runbooks/deployment.md`](../runbooks/deployment.md) を正本とする。
秘密値や実データをこのディレクトリへ置かない。

既存の非rootユーザーとcheckoutをそのまま使うホストでは、`.env` を作成した後に次の1コマンドで冪等に導入・再設定できる。

```sh
sudo env KAMELOG_NODE_BIN="$(command -v node)" ./ops/install-host.sh
```

このコマンドはruntime dataとbackupを削除しない。
