# ADR 0005: CI承認済みcommitをサーバーから取得する

## 状態

採用。

## 決定

本番ホストはsystemd timerでGitHubを定期確認し、`main` の先頭と成功済みCI runのcommitが一致した場合だけ更新する。
GitHub Actionsから本番ホストへのSSH接続やself-hosted runnerは使用しない。
更新は停止、整合バックアップ、image build、起動、health確認の順に行い、失敗時は直前のコードrevisionを再buildして起動する。

本番checkout、秘密値、backup、deploy状態をそれぞれ `/srv/kamelog`、`/etc/kamelog`、`/var/backups/kamelog`、`/var/lib/kamelog-deploy` に分離する。
deployプロセスは対話ログイン不能な専用ユーザーで実行する。

## 理由

本番ホストからのoutbound HTTPSだけで更新でき、GitHubへSSH秘密鍵やCloudflare資格情報を渡さずに済む。
失敗したCIや未検証のmain先頭を自動公開しない。
アプリデータをGit checkoutやcontainer imageから分離し、更新時の消失を防ぐ。

## 制約

Docker groupは実質的にroot相当の権限を持つため、専用ユーザーへ限定する。
コードrollbackはDB schemaを巻き戻さない。非互換migrationでは更新前backupから別volumeへ復元する。
backupの自動削除と、失敗通知・オフホスト転送は別の運用設定を必要とする。
