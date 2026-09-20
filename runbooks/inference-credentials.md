# 推論資格情報の運用

Jev APIキーはowner APIから登録する。`GET /api/inference/status` は設定済みかどうかだけを返し、登録済みキーを再表示しない。

`ops/install-host.sh` とインストール済みの `ops/kamelog-update` は、ホストのenvファイルに `KAMELOG_INFERENCE_ENCRYPTION_KEY` がなければ32 byteのbase64url鍵を一度だけ生成して追記する。既存の値は変更しない。`compose.yaml` はホストのenvファイルから鍵を読み込み、アプリと各ワーカーに実行時の環境変数として渡す。アプリやコンテナはenvファイルを書き換えない。

**既存のホストでは、コードをmainにマージしただけではインストール済みの `/usr/local/sbin/kamelog-update` は更新されない。** 新しいチェックアウトから `sudo env KAMELOG_NODE_BIN="$(command -v node)" ./ops/install-host.sh` を再実行し、鍵生成・systemdユニット配置・更新処理を反映する。`KAMELOG_APP_DIR` と `KAMELOG_ENV_FILE` をカスタマイズしている場合は、従来と同じ値を渡す。すでに同一リビジョンのコンテナが動いている場合、更新処理は早期終了するため、鍵を渡すには `docker compose --env-file .env -f compose.yaml up -d --no-deps app-blue`、次に `app-green`、最後に `federation-worker` を順次再作成する（envファイルが別の場所ならそのパスを指定）。鍵の値自体をコマンドライン、Issue、PR、CIログに書かない。

この鍵はDBとバックアップには入れない。SQLiteやバックアップだけが漏れてもJev APIキーを復号できなくするための境界であり、ホストやコンテナを侵害された場合まで守るものではない。鍵がない環境ではキー保存を拒否する。

鍵を失うと既存のAPIキーは復号できない。owner APIから古い資格情報を削除し、Jevで失効/再発行してから、新しいホスト鍵で再登録する。DB backupを復元する場合も、同じ復号鍵がなければ資格情報は使えない。鍵やAPIキーをIssue、PR、CIログ、commit、コンテナimageへ書かない。
