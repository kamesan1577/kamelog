# ActivityPub / Federation

kamelogは単一オーナーに対応するlocal Actorを1つだけ持つ。Federation未設定時はWebFingerとActivityPub endpointを公開せず、外部配送もしない。

## Identity初期化

owner sessionでアカウント画面を開き、半角小文字・数字・アンダースコア1〜64文字のusernameを指定して有効化する。予約語は拒否する。有効化時にserverがRSA 2048-bit key pairを生成し、username、鍵、作成日時をSQLiteへ1 transactionで保存する。

domainは `KAMELOG_ORIGIN` のhostを使う。ActivityPub専用のenable、username、private-key環境変数は使用しない。private keyはAPI responseやHTMLへ返さない。有効化後のusername変更・identity resetは通常UIの対象外。

## 公開endpoint

- `GET /.well-known/webfinger?resource=acct:{username}@{host}`
- `GET /activitypub/actor`
- `GET /activitypub/icon`
- `POST /activitypub/inbox`
- `GET /activitypub/outbox`
- `GET /activitypub/followers`
- `GET /activitypub/following`

Actorは既存profileの表示名、bio、iconを参照する。現段階のoutbox/followers/followingは空のOrderedCollectionであり、inboxは署名済みactivityを検証してidempotency recordへ保存する。FollowやCreate等の状態反映・配送は後続phaseで追加する。

## HTTP signature

inboxは `(request-target)`、`host`、`date`、`digest` を含むRSA-SHA256署名を必須にする。Digestはraw request bodyに対して検証し、Dateは10分以内に制限する。署名keyはremote Actor documentから取得し、`publicKey.id` とownerを照合する。失敗、改ざん、stale requestは拒否する。

Actor取得はHTTPSのみ、credentialsなし、既定port、公開IPだけを許可する。DNSの全結果を検証し、検証済みIPへ接続を固定する。redirect先も同じ検証をやり直し、timeout、最大3 redirects、1MiB response、JSON系Content-Typeの上限を設ける。test fixtureだけは明示optionでlocal HTTPを許可できる。

## Untrusted content

remote HTMLは `p`、`br`、`a`、`span`、`strong`、`em`、`code`、`pre`、`blockquote`、`ul`、`ol`、`li` のallowlistでsanitizeする。script、style、iframe、event handler、`javascript:` URLは除去する。raw remote HTMLを直接表示しない。

activity request bodyは1MiBまで。activity IDはSQLiteで一意にし、同じactivityの再送を二重登録しない。responseやlogへrequest body、private key、署名値を出さない。
