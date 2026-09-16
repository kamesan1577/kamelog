# ADR 0014: 単一ActorのActivityPub identityをSQLiteへ保存する

## 状態

採用。

## 決定

kamelogはオーナーに対応するActivityPub Actorを1つだけ持つ。一般ユーザー登録やMastodon互換APIは追加しない。

Federation identityはアカウント画面から一度だけ初期化する。username、RSA public/private key、作成日時をSQLiteのsingleton recordへ同一transactionで保存し、以後はDBを正本とする。username、enable flag、private keyのActivityPub専用環境変数は追加しない。domainとActor URLは既存の `KAMELOG_ORIGIN` から決める。

remote objectは既存のlocal `posts` へ混ぜず、専用の正規化cacheへ置く。owner-only Fediverse timelineはfollowingとselfだけを表示し、remote contentが公開timelineへ出るのはオーナーがRPした場合に限る。RPはActivityPubのAnnounceとして配信する。

outbound activityはSQLiteのdurable delivery queueへ保存し、同じimageを使うworkerが非同期配送する。remote障害をlocal投稿の失敗へ昇格させない。external positive reactionはlocal postごとにremote Actor単位で1いいねへ正規化し、既存anonymous likeと表示時に合算する。

remote mediaは受信時に無制限に保存せず、ownerがtimelineを表示したときだけ取得するserver-side proxy/cacheを採用する。HTTPS、公開IP、redirect先、timeout、MIME、magic bytes、画像寸法を検証し、1画像8MiB、cache全体256MiBに制限する。browserへremote URLを渡さず、cacheは再取得可能としてbackup対象外にする。remote Delete後は対応mappingを無効化して配信しない。大容量videoのproxyは対象外とし、表示できない媒体はoriginal URLへ案内する。

## セキュリティ境界

- inboxはHTTP request signatureとDigestを検証する。
- Actor/WebFinger/object取得はHTTPS、公開IP、既定port、redirect再検証、DNS解決後の接続先固定、時間・response size・Content-Type上限を必須にする。
- remote HTMLはallowlist sanitization後だけ保存・表示する。
- activity IDを一意にし、再送を二重処理しない。
- private keyとremote本文をresponse、HTML、log、Git、CI artifactへ出さない。

## 帰結

通常deployやDocker再作成では同じidentityを維持でき、既存のSQLite backup/restoreで鍵も復元される。復元先の `KAMELOG_ORIGIN` が変わる場合は同一Actor identityの継続を保証しない。有効化済みusername/domainの変更やidentity resetは破壊的な別設計とし、通常UIには置かない。
