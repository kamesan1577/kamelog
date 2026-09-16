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
- `GET /activitypub/objects/:postId`
- `GET /activitypub/activities/...`

Actorは既存profileの表示名、bio、iconを参照する。outboxは生成済みactivity、followersはlocal Actorをfollow中のremote Actor、followingはlocal ActorからのFollowがAccept済みのremote Actorを返す。ローカルobject/activity URLは一度配送した識別子を維持する。

## ローカル投稿とfollowers

ActivityPub有効化後の新規つぶやき・ブログはUIで `Fediverseにも配信` が既定ONになる。vlogは対象外。投稿ごとの `federationEnabled` をSQLiteのpost dataへ保存し、次の遷移をlocal postと同じtransactionでoutbound activityへ変換する。

- OFFからON: `Create(Note)`
- ONの本文・タイトル・画像変更: `Update(Note)`
- ONからOFF、またはONの投稿削除: `Delete(Tombstone)`

つぶやきはescaped HTML本文、canonical URL、公開画像、published/updatedをNoteへ載せる。ブログはタイトル、240文字以内の概要、canonical URLをNoteへ載せ、記事全文をremote側の正本にしない。固定状態だけの変更ではUpdateを生成しない。既存投稿は `federationEnabled=false` として扱い、明示操作なしに過去分を一括配送しない。

署名済み `Follow` はlocal Actor宛てだけを自動承認し、Actorのinbox/sharedInbox、元Follow IDを保存して `Accept` をqueueへ積む。同じsharedInboxは投稿activityごとに1配送へまとめる。`Undo(Follow)` は元Follow IDと署名Actorが一致したfollowerだけを削除する。

## Durable delivery worker

outbound activityとremote inbox単位のdeliveryをSQLiteへ保存する。local post APIはremote通信を行わず成功し、`federation-worker` Compose serviceが同じimage・volumeからpending jobを取得してHTTP署名付きPOSTを行う。

workerは処理中jobを5分後に回収可能とし、一時的なnetwork error、408、429、5xxを指数backoff（最大6時間、既定8 attempt）で再試行する。他の4xxと上限到達はdead stateにする。redirect先もURL/DNS/IPを再検証し、移動後のURLへ署名し直す。1件の失敗で他deliveryを止めない。

owner限定status APIはpending/dead件数、follower数、最終inbox受信時刻、worker heartbeatを返す。logはactivity type、remote domain、status、retry countだけを出し、本文・署名・鍵を出さない。

## Outgoing Followとremote cache

ownerはAccountの `フォロー管理` へ完全な `@user@domain` を入力する。serverはWebFingerのself linkを解決し、Actor ID、inbox/sharedInbox、表示名、usernameをSQLiteへ保存して `Follow` をdurable queueへ積む。状態はpending、accepted、rejected、failedのいずれかで、署名済み `Accept` / `Reject` は元Follow IDと送信Actorが一致する行だけを更新する。配送が恒久失敗したFollowはfailedにする。解除時は元Followをobjectにした `Undo` をqueueへ積み、followingから削除する。

Accept済みのfollowingから届いたpublic `Note` だけを専用のremote object cacheへ保存する。`Create` はtimeline entryを作成し、`Update` は同じobject ID・actorのcacheだけを更新し、`Delete` はtombstone化してtimelineから隠す。`Announce` は埋め込みNoteまたは安全にdereferenceしたNoteを保存し、`Undo(Announce)` は対応entryを隠す。followしていないActorの投稿activityはidempotency記録だけを行い、timeline cacheへ入れない。

remote objectはlocal `posts` に混在させない。本文は保存前にallowlist sanitizeし、画像attachmentはHTTPS URLと対応MIMEを最大4件まで正規化する。

## Owner-only Fediverse timeline

ActivityPub有効化済みかつログイン中だけ、既存Timelineに `kamelog | Fediverse` 切替を表示する。Fediverse modeはAccept済みfollowingから受信したCreate/Announceと、`federationEnabled=true` の自分のtweet/blogを新しい順に返す。local種別filter、sort、composerはこのmodeでは隠す。refreshはserver-side cacheを再取得するだけで、follow先outboxをpollしない。cursorは最終itemの時刻とIDを署名不要のopaque base64url値として扱い、不正値を拒否する。

remote cardはsanitized content、display name、handle、受信できた画像、original URLを表示する。Announceはannouncerを `○○がRP` として示す。remote iconはbrowserから直接取得せず、現段階では文字fallback avatarを使う。

remote画像はowner-onlyのlocal URLへ置換し、初回表示時にserverが取得する。既存SSRF境界に加え、画像Content-Type、magic bytes、寸法、1件8MiBを検証する。cache directoryは256MiBを上限に古いfileから削除し、再取得可能なためbackupへ含めない。remote objectのUpdate/Delete後は旧mappingから画像を配信しない。videoや未対応媒体はproxyせずoriginal postへ誘導する。

## HTTP signature

inboxは `(request-target)`、`host`、`date`、`digest` を含むRSA-SHA256署名を必須にする。Digestはraw request bodyに対して検証し、Dateは10分以内に制限する。署名keyはremote Actor documentから取得し、`publicKey.id` とownerを照合する。失敗、改ざん、stale requestは拒否する。

Actor取得はHTTPSのみ、credentialsなし、既定port、公開IPだけを許可する。DNSの全結果を検証し、検証済みIPへ接続を固定する。redirect先も同じ検証をやり直し、timeout、最大3 redirects、1MiB response、JSON系Content-Typeの上限を設ける。test fixtureだけは明示optionでlocal HTTPを許可できる。

## Untrusted content

remote HTMLは `p`、`br`、`a`、`span`、`strong`、`em`、`code`、`pre`、`blockquote`、`ul`、`ol`、`li` のallowlistでsanitizeする。script、style、iframe、event handler、`javascript:` URLは除去する。raw remote HTMLを直接表示しない。

activity request bodyは1MiBまで。activity IDはSQLiteで一意にし、同じactivityの再送を二重登録しない。responseやlogへrequest body、private key、署名値を出さない。
