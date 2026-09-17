# API v1（同一Origin / JSON）

すべての応答はno-store。書込はOrigin一致、owner session、入力検証を要求する。
認証APIだけは未ログインで利用可能だがceremony cookieと署名を検証する。

| Method                    | Path                        | 意味                                                    |
| ------------------------- | --------------------------- | ------------------------------------------------------- |
| GET                       | /api/health                 | 生存とschema version                                    |
| GET                       | /api/posts?kind=&q=         | 公開投稿。kind省略で全種別                              |
| GET                       | /api/posts/:id              | 公開詳細、存在しなければ404                             |
| POST                      | /api/posts/:id/view         | 公開詳細の閲覧数を加算                                  |
| POST / PUT / DELETE       | /api/posts[/id]             | ownerの投稿作成・更新・削除                             |
| GET / POST / PUT / DELETE | /api/drafts[/id]            | owner限定の下書き                                       |
| GET / PUT                 | /api/profile                | 公開プロフィール/owner更新                              |
| POST                      | /api/media?seconds=2        | raw動画、64MiB以下、尺2/5/10/30                         |
| POST                      | /api/media?kind=image       | PNG/JPEG/WebP/GIF画像、1枚12MiB以下                     |
| GET                       | /api/media/:id              | 公開投稿から参照される媒体、またはowner専用の未投稿媒体 |
| GET                       | /api/auth/session           | authenticated booleanのみ                               |
| POST                      | /api/auth/register/options  | 初回token、またはログイン済み追加登録                   |
| POST                      | /api/auth/register/verify   | WebAuthn登録response検証                                |
| POST                      | /api/auth/login/options     | 認証challenge生成                                       |
| POST                      | /api/auth/login/verify      | WebAuthn認証response検証                                |
| POST                      | /api/auth/logout            | session失効                                             |
| GET                       | /api/federation/status      | owner限定の有効状態・handle・配送/worker診断            |
| POST                      | /api/federation/setup       | owner限定の一度だけのidentity初期化                     |
| GET                       | /api/federation/following   | owner限定のfollowing一覧と状態                          |
| POST                      | /api/federation/follow      | handleをWebFinger解決しFollowをqueueへ登録              |
| DELETE                    | /api/federation/follow      | actorIdのUndo(Follow)をqueueへ登録                      |
| GET                       | /api/federation/timeline    | owner限定のfollowing+self timeline、cursor対応          |
| GET                       | /api/federation/reposts     | 公開Timelineへ出す有効なRP一覧                          |
| POST                      | /api/federation/reposts     | owner限定で受信済みobjectをRPしAnnounceをqueueへ登録    |
| DELETE                    | /api/federation/reposts/:id | owner限定でRPを解除しUndo(Announce)をqueueへ登録        |
| GET                       | /api/federation/media/:id   | ownerまたは公開中RP向けの検証済みremote画像cache        |

ActivityPub server-to-server endpointは `/api` と別の公開routeで提供する。詳細は [activitypub.md](activitypub.md) を参照する。`POST /activitypub/inbox` はbrowser Origin/sessionではなくHTTP signatureを認証境界にする。

## 入力

投稿: kind、title（300文字）、body（ブログ100,000/つぶやき5,000/vlog60）、tags（20件、各40文字）、pinned、video、time、images（つぶやきのみ最大4件）、parentId（つぶやきのみ任意）、federationEnabled（ブログ/つぶやきのみ任意）。
日時・いいね初期値・IDはサーバー生成。API入力で他人のID・過去日時へ差し替えない。
閲覧数はサーバー生成であり、投稿作成・更新APIから変更できない。閲覧APIは同一Originを要求し、投稿別の合計値だけを保存する。
公開投稿の `date` は初回公開日時として保持する。公開済みブログのtitleまたはbodyが変更された場合だけ、サーバー生成の `updatedAt` を保存して応答する。固定/解除など本文以外の変更では既存 `updatedAt` を維持する。
つぶやきの `parentId` は既存tweetだけを参照できる。作成後の親変更は拒否し、更新payloadで省略された場合は既存の親を保持する。
vlogのvideoとつぶやきのimagesは種類が一致する登録済み媒体のAPI pathだけを許可する。timeはHH:mm、captionは改行不可。
更新はrevisionをbodyに渡す。削除はIf-Matchにrevisionを渡す。競合は409であり無条件上書きしない。
federationEnabledはidentity設定済みのブログ/つぶやきだけtrueにできる。省略した更新では既存値を維持する。local保存とoutbound queue登録は同じtransactionで行い、remote配送結果はAPI応答を失敗させない。
federation followのPOST bodyは `handle`、DELETE bodyはfollowing一覧で取得した `actorId` を受け取る。任意URLをfetchするAPIにはせず、handleはserver側でWebFingerから解決する。Accept/Rejectとremote cacheは公開APIへ返さない。
timelineは `{ items, nextCursor }` を返し、`?cursor=` で続きへ進む。remote attachment URLは登録済みobjectから生成したlocal media URLだけを返し、入力URLをproxy targetとして受け取らない。RPのPOST bodyはowner timelineで取得した `objectId` だけを受け付け、Accept済みfollowing由来の有効なcacheとの一致を必須にする。media endpointはowner、または現在公開中のRPに結び付くmediaだけを返し、解除済みRP・deleted object・未登録mappingを404として扱う。
公開posts APIの `likes` は保存済みlocal likesと、有効なremote reactionのActor数を合算した値を返す。remote内訳・Actor・reaction種別は公開APIへ出さず、投稿更新時には合算値をlocal likesへ書き戻さない。
下書きはkind=blog/tweet、title、body、画像、任意のtweet用 `parentId`、更新時revisionを保存する。親は公開tweetに限り、親が削除済みでも通常投稿へ黙って変換しない。
プロフィールはname（80）、bio（500）、icon（短い絵文字または制限された画像data URL）。

## 認証セッション

owner sessionはSQLiteの `sessions` に保存し、cookieとDBの有効期限を30日で一致させる。通常のコンテナ再作成・アプリ再起動では永続volume上のDBを保持するため、期限内のsessionは継続する。明示logout、期限切れ、認証リセットでは失効する。

## エラー

400 invalid input/ceremony、401 unauthenticated、403 Origin、404 missing、409 revision conflict、413 size、429 throttled。
エラー本文は汎用メッセージとし内部パス・元例外・入力値を返さない。
動画Rangeは単一bytes range対応。認証媒体はpublic cacheしない。
