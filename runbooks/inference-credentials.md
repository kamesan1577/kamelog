# 推論資格情報の運用

Jev APIキーはowner APIから登録する。`GET /api/inference/status` は設定済みかどうかだけを返し、登録済みキーを再表示しない。

登録前にホストの `/etc/kamelog/env` などGit checkout外のroot所有設定へ、32 byteをbase64url化した `KAMELOG_INFERENCE_ENCRYPTION_KEY` を設定する。DBとbackupにはこの値を入れない。鍵がない環境ではキー保存を拒否する。

鍵を失うと既存のAPIキーは復号できない。owner APIから古い資格情報を削除し、Jevで失効/再発行してから、新しいホスト鍵で再登録する。DB backupを復元する場合も、同じ復号鍵がなければ資格情報は使えない。鍵やAPIキーをIssue、PR、CIログ、commit、コンテナimageへ書かない。
