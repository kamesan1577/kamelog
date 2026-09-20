# 推論資格情報の運用

Jev APIキーはowner APIから登録する。`GET /api/inference/status` は設定済みかどうかだけを返し、登録済みキーを再表示しない。

`ops/install-host.sh` は、ホストのenvファイルに `KAMELOG_INFERENCE_ENCRYPTION_KEY` がなければ32 byteのbase64url鍵を一度だけ生成して追記する。既存の値は変更しない。アプリやコンテナはenvファイルを書き換えず、常にホストが渡した値を読む。

この鍵はDBとバックアップには入れない。SQLiteやバックアップだけが漏れてもJev APIキーを復号できなくするための境界であり、ホストやコンテナを侵害された場合まで守るものではない。鍵がない環境ではキー保存を拒否する。

鍵を失うと既存のAPIキーは復号できない。owner APIから古い資格情報を削除し、Jevで失効/再発行してから、新しいホスト鍵で再登録する。DB backupを復元する場合も、同じ復号鍵がなければ資格情報は使えない。鍵やAPIキーをIssue、PR、CIログ、commit、コンテナimageへ書かない。
