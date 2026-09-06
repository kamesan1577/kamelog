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

## systemdによる本番起動

以下はDebian系ホストで、Docker Engine、Compose plugin、Git、curl、Node 24が導入済みであることを前提とする。
本番checkoutを開発用checkoutから分離し、対話ログイン不能な専用ユーザーで管理する。

```sh
sudo adduser --system --group --home /srv/kamelog --shell /usr/sbin/nologin kamelog
sudo usermod -aG docker kamelog
sudo install -d -o kamelog -g kamelog -m 0750 /srv/kamelog
sudo -u kamelog git clone https://github.com/kamesan1577/kamelog.git /srv/kamelog
sudo install -d -o root -g kamelog -m 0750 /etc/kamelog
sudo install -d -o kamelog -g kamelog -m 0700 /var/backups/kamelog /var/lib/kamelog-deploy
```

`/etc/kamelog/env` はGitへ追加せず、次の形式でrootが作成する。
bootstrap登録済みなら `KAMELOG_BOOTSTRAP_TOKEN` は書かない。

```dotenv
KAMELOG_ORIGIN=https://kamesan.org
```

権限を設定し、追跡対象のdeploy scriptとunitをroot領域へコピーする。

```sh
sudo chown root:kamelog /etc/kamelog/env
sudo chmod 0640 /etc/kamelog/env
sudo install -o root -g root -m 0755 /srv/kamelog/ops/kamelog-update /usr/local/sbin/kamelog-update
sudo install -o root -g root -m 0644 /srv/kamelog/ops/systemd/*.service /etc/systemd/system/
sudo install -o root -g root -m 0644 /srv/kamelog/ops/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kamelog.service kamelog-update.timer
```

既存の `~/dev/kamelog` Composeから移行する場合も、ディレクトリ名が同じため既定のCompose project/volume名は維持される。
先に既存アプリを `docker compose stop app` で止め、上の `kamelog.service` を開始する。
`down -v` は実行しない。

DockerとCloudflare Tunnelもboot時に起動するよう確認する。

```sh
sudo systemctl enable docker cloudflared
sudo systemctl is-enabled docker cloudflared kamelog.service kamelog-update.timer
sudo systemctl is-active docker cloudflared kamelog.service kamelog-update.timer
curl --fail http://127.0.0.1:3000/api/health
```

## 自動更新

`kamelog-update.timer` は約5分ごとに公開GitHub APIと `origin/main` を照合する。
main先頭と成功済みpush CIのSHAが一致した場合だけ、アプリ停止、backup、checkout、build、起動、health確認を行う。
GitHub Actionsから本番サーバーへの接続や受信ポートの追加は不要。

初回は手動で実行し、ログと状態を確認する。

```sh
sudo systemctl start kamelog-update.service
sudo systemctl status kamelog-update.service --no-pager
sudo journalctl -u kamelog-update.service -n 100 --no-pager
sudo systemctl list-timers kamelog-update.timer
```

失敗時は直前のコードrevisionを再buildして起動するが、更新前backupは削除しない。
失敗通知はホスト側の監視へ接続する。
deploy script自体とsystemd unitはroot所有の固定コピーであり、Git更新では自動置換しない。
これらを変更したreleaseでは、レビュー後に再度 `install` してからtimerを再開する。

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
