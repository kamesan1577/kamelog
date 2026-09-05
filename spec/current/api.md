# API v1（同一Origin / JSON）

すべての応答はno-store。書込はOrigin一致、owner session、入力検証を要求する。
認証APIだけは未ログインで利用可能だがceremony cookieと署名を検証する。

| Method                    | Path                       | 意味                                                    |
| ------------------------- | -------------------------- | ------------------------------------------------------- |
| GET                       | /api/health                | 生存とschema version                                    |
| GET                       | /api/posts?kind=&q=        | 公開投稿。kind省略で全種別                              |
| GET                       | /api/posts/:id             | 公開詳細、存在しなければ404                             |
| POST / PUT / DELETE       | /api/posts[/id]            | ownerの投稿作成・更新・削除                             |
| GET / POST / PUT / DELETE | /api/drafts[/id]           | owner限定の下書き                                       |
| GET / PUT                 | /api/profile               | 公開プロフィール/owner更新                              |
| POST                      | /api/media?seconds=2       | raw動画、64MiB以下、尺2/5/10/30                         |
| GET                       | /api/media/:id             | 公開投稿から参照される動画、またはowner専用の未投稿動画 |
| GET                       | /api/auth/session          | authenticated booleanのみ                               |
| POST                      | /api/auth/register/options | 初回token、またはログイン済み追加登録                   |
| POST                      | /api/auth/register/verify  | WebAuthn登録response検証                                |
| POST                      | /api/auth/login/options    | 認証challenge生成                                       |
| POST                      | /api/auth/login/verify     | WebAuthn認証response検証                                |
| POST                      | /api/auth/logout           | session失効                                             |

## 入力

投稿: kind、title（300文字）、body（ブログ100,000/つぶやき5,000/vlog60）、tags（20件、各40文字）、pinned、video、time。
日時・いいね初期値・IDはサーバー生成。API入力で他人のID・過去日時へ差し替えない。
vlogのvideoは登録済み媒体のAPI pathだけを許可する。timeはHH:mm、captionは改行不可。
更新はrevisionをbodyに渡す。削除はIf-Matchにrevisionを渡す。競合は409であり無条件上書きしない。
下書きはkind=blog/tweet、title、body、更新時revision。
プロフィールはname（80）、bio（500）、icon（短い絵文字または制限された画像data URL）。

## エラー

400 invalid input/ceremony、401 unauthenticated、403 Origin、404 missing、409 revision conflict、413 size、429 throttled。
エラー本文は汎用メッセージとし内部パス・元例外・入力値を返さない。
動画Rangeは単一bytes range対応。認証媒体はpublic cacheしない。
