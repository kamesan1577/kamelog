# Security

リポジトリの公開とアプリの本番公開は別の判定。
`HANDOFF.md` と `runbooks/deployment.md` の未検証項目が残る間は本番公開可能とみなさない。

実投稿・下書き・プロフィール・媒体・DB・cookie・token・内部アドレスを公開Issue/PR/ログに貼らない。
脆弱性や漏洩は公開Issueへ書かず、利用可能ならGitHubのprivate vulnerability reportingを使用する。
その経路がなければ所有者の私的な連絡経路で相談する。秘密値をここに書かない。

変更時は `docs/security/threat-model.md` の境界テストを実施する。
秘密値がGitへ入った場合は利用停止・失効を先に行う。ref書換だけで削除完了とはしない。
古いSHA・cache・forkの消去はGitHub Supportが必要な場合がある。

本番更新はGitHub Actionsからサーバーへ接続せず、専用ユーザーが公開GitHub APIをpullする。
成功済みmain CIのcommitだけを対象にする。
専用ユーザーのDocker group権限はroot相当として扱い、対話ログインと他サービスの管理を許可しない。
`/etc/kamelog/env`、backup、runtime dataをGit checkoutへ置かない。
deploy scriptとsystemd unitはroot所有で設置し、pullしたコードから自動的に自己更新させない。
