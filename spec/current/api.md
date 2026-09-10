# API v1（同一Origin / JSON）

すべての応答はno-store。書込はOrigin一致、owner session、入力検証を要求する。
認証APIだけは未ログインで利用可能だがceremony cookieと署名を検証する。

| Method                    | Path                       | 意味                                                    |
| ------------------------- | -------------------------- | ------------------------------------------------------- |
| GET                       | /api/health                | 生存とschema version                                    |
| GET                       | /api/posts?kind=&q=        | 公開投稿。kind省略で全種別                              |
| GET                       | /api/posts/:id             | 公開詳細、存在しなければ404                             |
| POST                      | /api/posts/:id/view        | 公開詳細の閲覧数を加算                                  |
| POST / PUT / DELETE       | /api/posts[/id]            | ownerの投稿作成・更新・削除                             |
| GET / POST / PUT / DELETE | /api/drafts[/id]           | owner限定の下書き                                       |
| GET / PUT                 | /api/profile               | 公開プロフィール/owner更新                              |
| POST                      | /api/media?seconds=2       | raw動画、64MiB以下、尺2/5/10/30                         |
| POST                      | /api/media?kind=image      | PNG/JPEG/WebP/GIF画像、1枚12MiB以下                     |
| GET                       | /api/media/:id             | 公開投稿から参照される媒体、またはowner専用の未投稿媒体 |
| GET                       | /api/auth/session          | authenticated booleanのみ                               |
| POST                      | /api/auth/register/options | 初回token、またはログイン済み追加登録                   |
| POST                      | /api/auth/register/verify  | WebAuthn登録response検証                                |
| POST                      | /api/auth/login/options    | 認証challenge生成                                       |
| POST                      | /api/auth/login/verify     | WebAuthn認証response検証                                |
| POST                      | /api/auth/logout           | session失効                                             |

## 入力

投稿: kind、title（300文字）、body（ブログ100,000/つぶやき5,000/vlog60）、tags（20件、各40文字）、pinned、video、time、images（つぶやきのみ最大4件）、parentId（つぶやきのみ任意）。
日時・いいね初期値・IDはサーバー生成。API入力で他人のID・過去日時へ差し替えない。
閲覧数はサーバー生成であり、投稿作成・更新APIから変更できない。閲覧APIは同一Originを要求し、投稿別の合計値だけを保存する。
公開投稿の `date` は初回公開日時として保持する。公開済みブログのtitleまたはbodyが変更された場合だけ、サーバー生成の `updatedAt` を保存して応答する。固定/解除など本文以外の変更では既存 `updatedAt` を維持する。
つぶやきの `parentId` は既存tweetだけを参照できる。作成後の親変更は拒否し、更新payloadで省略された場合は既存の親を保持する。
vlogのvideoとつぶやきのimagesは種類が一致する登録済み媒体のAPI pathだけを許可する。timeはHH:mm、captionは改行不可。
更新はrevisionをbodyに渡す。削除はIf-Matchにrevisionを渡す。競合は409であり無条件上書きしない。
下書きはkind=blog/tweet、title、body、更新時revision。
プロフィールはname（80）、bio（500）、icon（短い絵文字または制限された画像data URL）。

## 認証セッション

owner sessionはSQLiteの `sessions` に保存し、cookieとDBの有効期限を30日で一致させる。通常のコンテナ再作成・アプリ再起動では永続volume上のDBを保持するため、期限内のsessionは継続する。明示logout、期限切れ、認証リセットでは失効する。

## エラー

400 invalid input/ceremony、401 unauthenticated、403 Origin、404 missing、409 revision conflict、413 size、429 throttled。
エラー本文は汎用メッセージとし内部パス・元例外・入力値を返さない。
動画Rangeは単一bytes range対応。認証媒体はpublic cacheしない。
