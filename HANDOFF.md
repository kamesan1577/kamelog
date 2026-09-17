# kamelog handoff

2026-09-17 Issue #99 migration continued with owner settings. Profile upload, avatar picker, settings fields, and responsive settings heading now use the OwnerSettings Design System pattern; existing behavior and CSS hooks remain intact. check:ui, typecheck, lint, and public-repo check passed locally.

2026-09-17 Issue #99 migration continued with dialog and action auxiliary styles. Draft lists, save/delete confirmation actions, inline tweet input, and post-action wrapping now use Design System data-ds boundaries; the corresponding global rules were removed. check:ui, typecheck, and lint passed locally; PR #225 CI is pending.

2026-09-17 Issue #99 E2E selector cleanup continued with semantic post and Markdown locators. The remaining post overflow control now has an accessible name, syntax-highlighting class assertions were removed from E2E in favor of content behavior coverage, and lint/typecheck passed; PR #207 CI is pending.

2026-09-17 Issue #99 E2E selector audit completed for the current suite: the remaining project-article implementation selector was replaced with a semantic article query scoped to the projects region. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with EmptyState. Local and Fediverse timeline empty results now share the Design System EmptyState pattern and Storybook state while preserving the existing action and styling hooks. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 navigation selectors continued. Federation guide, mobile navigation, public sidebar navigation, and page headers now use semantic data-ds contracts in route and social-link journeys; only the negative project-article assertion remains to be replaced with a meaningful project detail contract.

2026-09-17 Issue #99 migration continued with ProfileCard. The owner sidebar profile is now rendered through a shared Design System pattern and Storybook state, with the existing profile handle and link presentation preserved through the semantic boundary. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with reader/editor semantic regions. Preview shell, Markdown output, Mermaid output, help dialog, active filters, and admin access now expose data-ds contracts; blog and owner journey assertions use semantic boundaries. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with post/video semantic contracts. Tweet previews, vlog frames/captions, detail tweet bodies, and site navigation assertions now use data-ds boundaries instead of implementation-only class selectors. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with composer/editor contracts. The inline composer toolbar and editor modal mode now expose semantic state boundaries, and journey assertions use those contracts for upload, authoring, and full-page transitions. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with ProjectList semantic items. Project tiles now expose stable data-ds variants used by the social-link bridge and project E2E assertions, while approved CSS hooks remain for presentation. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with link preview contracts. Inline links and generated OGP cards now expose data-ds markers; ownership and cleanup selectors use the semantic card boundary, and journey/link-preview tests no longer select those cards by CSS class. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with detail and page-header contracts. Detail Markdown, post actions fixtures, federation timeline heading lookup, and navigation route assertions now use semantic data-ds boundaries while preserving existing visual classes and behavior. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 selector migration continued across landing, sidebar, mobile editor, Fediverse timeline, profile, and video regions. These areas now expose semantic data-ds boundaries and their journey assertions use those contracts instead of implementation-only class selectors. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with landing semantic regions. The home landing/profile sections now expose data-ds boundaries, and representative E2E assertions no longer select them through CSS class names. lint/typecheck/format/UI/public checks are pending for this stacked change.

2026-09-17 Issue #99 migration continued with blog reading tools. The generated table of contents now exposes a Design System data-ds boundary and its existing responsive reading-rail styles target that semantic boundary. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with TimelineItem. Local timeline posts now enter the shared TimelineItem boundary, which delegates the existing PostCard semantics and keeps feature-owned content/actions intact. lint, typecheck, format, UI semantic guardrails, and public-repo check passed; stacked CI is pending.

2026-09-17 Issue #99 migration continued with owner account regions. Account settings, profile/avatar controls, federation settings, following management, and federation setup now expose semantic data-ds boundaries; the Fediverse section also uses the shared OwnerSection pattern while preserving existing behavior and CSS hooks. CI for stacked PR #144 is green; #145 verification is pending.

2026-09-17 Issue #99 selector migration continued. Journey tests now prefer data-ds contracts for composer, dialog, gallery, post preview/card, projects, federation, mobile create, and editor footer; a sidebar icon assertion now uses navigation/button roles. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with PostActions. Like, link-copy, X-share, and owner menu behavior now share a semantic action-group shell without moving their callbacks. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with MediaGallery. Attached image grids and the existing lightbox state/semantics now live in a shared pattern; the app keeps the approved grid hooks and media URLs. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with MediaUploadField. Blog/tweet image selection now shares the upload-field shell while optimization, destination, limits, and persistence remain feature-owned. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with EditorFooter. The blog/tweet editor now delegates character count and close/submit action layout to a shared pattern; save/publish callbacks remain unchanged. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with BlogEditorWorkspace. Edit/preview/split rendering now uses a shared workspace pattern; Markdown rendering, image drop, and mode state stay in the feature layer. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with BlogEditorToolbar. The Markdown editing toolbar now has a shared Design System shell while editor commands, view mode state, help, and full-page behavior remain unchanged. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with InlineComposer. The desktop inline tweet composer now delegates its textarea keyboard/drop behavior and layout slots to a shared Design System pattern; media, toolbar actions, and persistence callbacks remain feature-owned. lint, typecheck, UI semantic guardrails, and format check passed.

2026-09-17 Issue #99 migration continued with a colocated TagList pattern. Detail and timeline tags now share automatic-tag labeling and optional selection behavior while Badge variants remain feature-configured. lint, typecheck, UI semantic guardrails, and format check passed; stacked CI verification is pending.

2026-09-17 Issue #99 migration continued with a colocated PostCard pattern. Timeline local posts now share a semantic card shell with pinned state while feature-owned content and actions remain unchanged. lint, typecheck, UI semantic guardrails, and format check passed; stacked CI verification is pending.

2026-09-17 Issue #99 migration continued with a colocated PostPreview pattern. Timeline blog/tweet excerpts now share the Design System rendering boundary while vlog-specific media remains feature-owned. lint, typecheck, UI semantic guardrails, format, and public-repo check passed. Storybook build passed; browser component tests remain blocked locally by missing Chromium, while stacked CI verification is pending.

2026-09-17 Issue #99 migration continued with a colocated PostMeta pattern. Timeline/detail metadata now shares one Design System component while the app boundary retains the approved legacy CSS hooks. lint, typecheck, UI semantic guardrails, format, Storybook build, and public-repo check passed; local Storybook browser tests remain unavailable because Chromium is not installed. CI verification is pending on the stacked PR.

2026-09-17 Issue #99 migration continued through PR #132: PageHeader、ContentIndex、ProjectListを追加し、account/projects/timeline/landingの表示を段階移行した。token theme生成と文字utilityの境界も修正。ProjectListのProjects E2E 7件、Storybook 19件、typecheck、lint、format、UI契約、公開検査、本番buildを確認済み。全体の残りはTimeline/Post/Detail、Composer、Blog editor、Owner UIとlegacy CSS撤去。

2026-09-17 Issue #99 Phase 0〜3で移行マップ、AppShell、SideNavigation、MobileNavigationを追加し、既存のホームナビゲーションへ接続した。PR #124〜#128をstackedで作成。UI契約、公開検査、型、lint、本番build、モバイルナビE2Eは成功。全E2Eは24/25成功で、残るjourneyのvlog動画表示失敗はFFmpeg/fixture依存の既存課題として未解決。ホストのmake checkはFFmpeg未導入でmedia testが失敗するため、Storybook component testはPlaywright containerで成功確認した。

2026-09-16 Issue #98: Storybook 10、addon-vitest、Design System token、primitive/layout、colocated Storyを追加。/lintをESLint 9へ統合し、Design System領域で6 ruleをerror化。check:uiは依存方向・Story必須・legacy CSS allowlistを検査し、Playwright visual regressionは390/768/1440pxを対象とする。Node 24/FFmpeg/Playwright containerでcomponent 13件、visual 3件、unit 75件、make check全体が成功。既存UI全面移行は#99。

2026-09-14 Issue #102: トップの技術プロフィール、実務の取り組み、Selected Works、学歴・資格・連絡先を型付き公開データから表示。Projectsに3件の内部詳細ページを追加し、Qiitaを作品一覧から移した。`make check` は成功。Chromium配布元がtimeout/502を返してブラウザを取得できず、ローカル `make e2e` はブラウザ起動前に停止。PR CIでE2Eを確認する。実機確認は未実施。

2026-09-13 Issue #96: X Web Intentを新規投稿に追加。つぶやき・ブログは初回ON、vlogはOFF、端末で種別ごとに保存。公式twitter-textで280 weighted charactersを検証し、保存失敗時の空タブ閉鎖とポップアップ遮断時の手動リンクを実装。CIおよび実機確認はPRで追跡する。

## 入口

`AGENTS.md` → `spec/invariants/` → `spec/current/` → 関連ADR → テスト/実装の順に読む。
Issueは作業追跡に限り、チャット内容を読む必要はない。

## 現在の実装

- 承認済みメインUIのCSS checksumとPC/スマホ構造を契約テストで固定。
- 未ログイン表示とオーナー操作を分離し、WebAuthnパスキーを実署名検証。
- 投稿・下書き・プロフィールをSQLite、vlogを同一永続volumeへ保存。
- vlogをFFmpegで実際に1280x720、2/5/10/30秒へ変換。
- PCのインラインつぶやき、投稿ショートカット、モーダル内下書き復元、モバイル操作性を実装。
- PCホームの画像添付は現在のつぶやきへ媒体を加える独立行に分け、ブログ・つぶやき・vlogの投稿種別操作と視覚的に区別する。
- 投稿モーダルは最初のテキスト入力欄へ初期フォーカスする。スマホの投稿入力欄は16px以上を維持し、iOS系ブラウザのフォーカス時自動ズームを誘発しない。
- スマホのブログMarkdownツールバーは記法列だけを横スクロールさせ、ヘルプとプレビュー操作を投稿モーダル内に保持する。
- スマホの投稿モーダルは閉じる・下書き保存・投稿/更新を上端の追従ヘッダーに置き、キーボード表示中も操作できる。PCの投稿フッターは従来どおり維持する。
- 10秒以下vlogの無音ループと即時停止、リンクコピー/X共有、投稿別OGP画像を実装。
- 投稿詳細の `?post=` と画面状態をHistory APIで同期し、詳細内の「戻る」、ブラウザの戻る/進む、ホーム等のナビゲーションでURLと表示が食い違わないようにする。直接共有URLから開いた詳細の「戻る」はホームへ戻す。
- ブログ詳細のいいね・リンクコピー・X共有は読書中も追従する。1000px以上では本文左側の縦型sticky rail、999px以下では下部floating bar、640px以下ではモバイルナビの上へ固定する。タイムライン側の操作は維持する。
- `robots.txt` / 動的sitemap / canonical / OGP・Twitter URL / WebSite・Person・BlogPosting JSON-LDを公開originへ統一し、本番メタデータへlocalhostを出さない。sitemapはホームと公開ブログだけを列挙し、存在しない投稿詳細は404にする。
- revision競合、Origin/CSRF、入力上限、媒体Range、rate limitをAPIで処理。
- つぶやきのリンクプレビューはDOM更新ごとに所有元を検証し、詳細から他ページへ移動した際の孤立カードを除去して、再表示を繰り返しても1投稿1枚に保つ。
- DB/媒体のhash manifest付きbackup/restoreと全パスキー喪失時のoffline reset。
- Node 24の非root本番image、開発Compose、CIのcheck/e2e/container job。
- 成功済みmain CIだけを取得するpull型自動deploy、停止backup、health、コードrollback、systemd boot起動。
- 自動deployはオンライン整合backup後に新imageをbuildし、常駐gateway配下のblue/greenを1系統ずつhealth確認して更新する。
- ブログMarkdownはCommonMark/GFMを表示し、記法ツールバー、全記法ヘルプ、言語指定コードのシンタックスハイライトを提供する。パースは `react-markdown` / `remark-gfm`、ハイライトは `rehype-highlight` / `highlight.js` に任せ、生HTMLは無効のまま維持する。
- ブログ詳細は描画済みの `h2`〜`h6` から本文直前へ目次を自動生成する。記事タイトルの `h1` は除外し、同名見出しには一意なアンカーを割り当てる。目次操作では投稿詳細のURL履歴を増やさない。
- ブログ本文への画像D&Dと画像追加ボタン、Mermaidコードブロック、単独行のYouTube/X投稿URL埋め込みを実装。つぶやきは画像のみを含め最大4枚をD&D/選択でき、1〜4枚グリッドと拡大表示を提供する。
- ブログ本文とつぶやき入力欄へのクリップボード画像貼り付けを画像アップロードへ接続。D&D・画像追加ボタン・貼り付けの静止画はブラウザ側で長辺2560px以下のWebPへ最適化し、変換で大きくなる画像とGIFは元ファイルを使う。
- ブログ投稿は既存モーダルからフルページ編集へ切り替え可能。編集・リアルタイムプレビュー・左右分割を切り替え、狭い画面では分割ペインを上下に配置する。
- ブログは初回公開日時を保持し、公開後のタイトル/本文編集時だけ最終更新日時を保存して公開表示する。固定/解除では最終更新日時を動かさない。
- 自動タグ付けは投稿APIから分離したローカル分類バッチで実行する。手動タグ付き投稿を教師データにしたTF-IDF＋文字bigram分類で既存タグだけを提案し、`post_tags` に由来・信頼度・本文ハッシュ・分類器版を保存する。APIの`tags`・検索・タグ一覧では手動タグと自動タグを統合する。systemd timerは1時間間隔でDocker上のバッチを起動する。
- ActivityPub identityはアカウント画面から一度だけ初期化し、usernameとserver生成RSA key pairをSQLiteへ保存する。未設定時はWebFinger/Actorを404にし、設定後はWebFinger、Person Actor、icon、outbox/followers/followingを公開する。inboxはDigest・HTTP署名・Date、Actor key、1MiB上限、activity ID一意性を検証する。Followを自動Acceptし、つぶやき/ブログのCreate・Update・Deleteをlocal transaction内のSQLite queueへ積み、別workerがHTTP署名、SSRF検証、retry/backoff付きでsharedInboxへ配送する。
- Accountのフォロー管理からremote handleをWebFinger解決し、Follow/Undoをdurable queueへ積む。Accept/Reject/failed状態をSQLiteへ保存し、Accept済みActorのCreate/Update/Delete/Announce/Undoだけをsanitized remote cacheとowner用timeline entryへ正規化する。remote cacheはlocal postsへ混在させず、表示とmedia proxyは後続Phaseで扱う。
- ActivityPub有効化済みオーナーのTimelineに `kamelog | Fediverse` modeを追加し、Accept済みfollowingの受信投稿・Announceと自分のfederation対象投稿をcursor付きowner APIから表示する。refreshは受信済みstateだけを再取得する。remote画像はowner-only local URLへ置換し、SSRF、MIME、magic、寸法、8MiB上限を検証したうえで最大256MiBの再取得可能cacheへ保存する。
- owner-only Fediverse timelineのremote投稿をRPすると、公開Timelineの「すべて」へ `かめさんがRP` として表示し、Announceをdurable queueへ積む。解除はUndo(Announce)を積み、remote Deleteでも同じtransactionで公開RPを無効化してUndoを積む。公開remote画像は有効なRPへ結び付く登録済みmappingだけを配信する。
- local federated postへのLikeとEmojiReactをremote Actor単位で最大1件の「いいね」に正規化し、既存local likesへquery時に合算する。Undo/Deleteは同じActorの現在のreaction IDだけを解除し、古いUndoで置換後のreactionを消さない。remote内訳は公開しない。
- `/federation` にActivityPub対応、現在のhandle、標準的な接続手順、inbound/outbound対応表、公開endpointを示す簡潔な公開ガイドを置く。通常画面のfooterとsitemapから到達でき、kamelog固有の登録や独自protocolは要求しない。
- つぶやき詳細はルート投稿でも「スレッド」見出し・全件数・表示中の投稿を常に示し、親投稿・表示中・子孫投稿を上から下へ読める一つの画面として表示する。
- AGENTS、仕様、不変条件、ADR、脅威モデル、runbook、リポジトリ固有skillsを整備。
- 公開プロフィールは `@kamesan1577`、公開リンクはGitHubとQiitaを表示する。投稿・下書き・設定の実データは初期化しない。
- インデックスはサイト紹介、公開プロフィール、3種のコンテンツ、プロジェクト、公開投稿から選ぶ人気投稿1件を表示し、投稿一覧は独立したタイムラインとして提供する。
- インデックスは2021年の情報系大学入学と2025年の卒業・エンタメ系企業入社を経歴として表示する。人気投稿は投稿詳細の閲覧回数で選び、同一タブの再表示を重複加算しない。サーバーは投稿別合計だけを保存する。
- 元の「タイムラインを見る」に使っていた墨色 `#37352f` をサイト全体のメインカラーとし、主要操作・選択状態・focus・リンクへ展開する。地は暖色のオフホワイト、情報面は白と1px罫線で区切り、トップページとタイムラインの情報構造が一目で分かれる面構成にする。`react-notion-x` は投稿データ用レンダラーのため採用しない。
- コンテンツ種別アイコンは薄いグレー面と細い全周罫線、経歴の年は背景なしの文字で表示する。カードの片側だけを太い罫線で強調する意匠は使わない。

## 検証済み

- 2026-09-17 Issue #99 CSS migration status: 404, TOC, X share, profile/project, link preview, federation guide, editor/composer, detail actions, navigation, tweet thread, landing, engineering, brand theme, and the global style layer have moved out of the app CSS boundary. The legacy allowlist is empty; selector-level extraction from styles/globals.css remains incomplete. typecheck, check:ui, check:public, and diff check passed.

- 2026-09-17 Issue #99の404画面を`NotFoundState`パターンへ移行し、colocated Storybook storyを追加した。`app/not-found.module.css`を削除してlegacy allowlistを17ファイルへ削減。typecheck、check:ui、check:public、diff checkを実行済み。CIの`check` / `e2e` / `container`はPRで確認する。

- 2026-09-16 ActivityPub Phase 6でlocal federated postへのLike/EmojiReact受信、Actor単位dedupe、Undo/Delete、local likesとのquery時合算を追加した。`make check`（unit 73件、typecheck、lint、format、production build、public-repo/UI check、UI components 8件）が成功。同一Actorのreaction置換、古いUndoの無効化、現在reactionのUndo/Delete、非following Actor、投稿編集後のlocal likes非汚染、backup/restoreをunit testで確認した。
- 2026-09-16 ActivityPub Phase 5でownerのremote投稿RP/解除、公開Timelineの「すべて」へのRP混在、Announce/Undoのdurable配送、remote Delete連動、公開RP画像の限定配信を追加した。`make check`（unit 72件、typecheck、lint、format、production build、public-repo/UI check、UI components 8件）が成功。RP APIの認証、二重RP拒否、別Actor Delete拒否、unfollow後の正規Actor Delete、backup/restore、公開画像のRP解除後404をunit testで確認した。
- 2026-09-16 ActivityPub Phase 4でowner-only Fediverse timeline、self投稿、cursor、refresh、original link、remote image proxy/cacheを追加した。`make check`（unit 71件、typecheck、lint、format、production build、public-repo check）が成功。未ログインAPI拒否、local URLへのattachment置換、cursor、不正画像拒否、cache再利用、remote Delete後のfile/mapping無効化をunit testで確認した。ローカル環境にPlaywright Chromiumがないため、追加したmode切替・self表示・refresh・390px screenshotはstacked PR CIで確認する。
- 2026-09-16 ActivityPub Phase 3でremote handleのWebFinger解決、outgoing Follow/Undo、Accept/Reject/failed状態、Accountのfollowing管理、Accept済みActorのCreate/Update/Delete/Announce/Undoと専用cacheを追加した。`make check`（unit 69件、typecheck、lint、format、production build、public-repo check）が成功。backup/restoreでfollowingとremote timeline cacheの復元も確認した。ローカル環境にPlaywright Chromiumがないため、追加したfollowing管理のmobile/desktop E2Eはstacked PR CIで確認する。
- 2026-09-16 ActivityPub Phase 1で `npm test`（62件）、typecheck、lint、format check、production build、public-repo checkが成功。owner-only setup、鍵の再open/backup/restore、WebFinger/Actor、署名改ざん拒否、inbox idempotency、SSRF private/redirect拒否、remote HTML sanitizationをunit testで確認した。Playwright journeyへ390px初期設定、1280px有効状態、再読込後永続、private key非露出とスクリーンショットを追加した。ローカルE2EはChromium配布元が30秒timeoutを繰り返し、browser取得前に停止したため未実施。PR CIの `e2e` で確認する。
- 2026-09-16 ActivityPub Phase 2で投稿ごとのfederationEnabled、tweet/blog Note、Create/Update/Delete、Follow自動Accept/Undo、followers、SQLite durable delivery、別worker、sharedInbox dedupe、署名付き配送、retry/backoff/dead state、worker診断を追加した。`npm test`（66件）、typecheck、lint、format check、production build、public-repo checkが成功。ローカル環境にDocker CLIとPlaywright Chromiumがないため、Compose実buildと追加E2Eはstacked PR CIの `container` / `e2e` で確認する。
- 2026-09-11 つぶやきスレッド詳細再設計後、`make check`（公開検査、既存UI契約、型、lint、unit、本番build）が成功。ルートでも見出し・全件数・表示中を示し、親・現在・子孫の読順を固定するE2Eを追加した。ローカルE2EはPlaywright Chromium配布元のtimeout/502でブラウザを取得できず起動前に停止したため、PR CIの `e2e` で確認する。
- 2026-09-10 スマホ投稿ヘッダー変更後、`make check`（公開検査、既存UI契約、型、lint、unit、本番build）が成功。390px幅・表示高520pxで入力フォーカス中も投稿ボタンがviewport内に残り、PCでは新ヘッダーを表示しないE2Eを追加した。ローカルE2EはPlaywright Chromium配布元のtimeout/502でブラウザを取得できず未実施のため、PR CIの `e2e` で確認する。
- ローカル `make check`: public-repo check、UI契約、型、lint、unit/API/media/backup test、本番build。
- 実FFmpegによる縦動画fixtureの16:9変換。
- 2026-09-11 リンクプレビュー画面遷移修正後、Node 24・FFmpeg環境の `make check` とPlaywright 1.63の全16 E2E、CI `container` 相当（Compose構文、本番/開発image build、非root、health、再起動後永続）が成功。つぶやき詳細からプロジェクトへ移動してブラウザで戻る操作を3回繰り返し、別ページでは0枚、投稿詳細では常に1枚となる回帰を追加した。1280pxのChromiumで確認し、390px既存journeyも成功。実機確認は未実施。
- 不正WebAuthn応答、未ログイン書込、Origin不一致、revision競合、破損backup拒否。
- GitHub Actions run #52（commit `ed946978372062b7db871617a91959005ac66ea9`）の `check` / `e2e` / `container` がすべて成功。
- Playwright Chromiumで匿名表示、PC/スマホ、仮想パスキー、下書き保護・復元、投稿永続化、Markdown無害化、再ログイン、実動画vlog投稿を確認。
- 本番Docker imageの非root起動、health、再起動後のデータ永続、Compose構文、開発image buildを確認。
- production dependency auditはhigh以上0件。
- 2026-09-07 Markdown変更後、Node 24・FFmpeg環境の `make check`、Playwright Chromiumの全E2E、CI `container` 相当（Compose構文、本番/開発image build、非root、health、再起動後永続）が成功。production dependency auditは0件。
- GitHub Actions run #34073823834（commit `ec5f3994`）の `check` / `e2e` / `container` がすべて成功。
- 2026-09-07 画像・埋め込み変更後、`make check`（画像magic/寸法、未公開媒体、4枚上限、Markdown埋め込み、型、lint、本番buildを含む）が成功し、production dependency auditは0件。ローカルE2EはPlaywright Chromium配布元の502/timeoutでブラウザを取得できず未実施。PRのCI `e2e` で確認する。
- 2026-09-10 無停止deploy変更後、Node 24.20.0・FFmpeg環境の `make check`、Playwright 1.63の全E2Eが成功。分離Composeでオンラインbackup、blue再作成中120回の連続health、blue/green個別healthを確認し、2 app＋gatewayは合計約113MiBだった。
- 2026-09-10 対象ホストへ固定script/unitとblue/green＋gatewayを導入。main SHA `6f2369f` をtimerが自動取得し、オンラインbackup、blue/green個別更新、公開healthまで成功した。稼働時は2 app＋gatewayで約110MiB。旧appコンテナだけを削除し、永続volumeとbackupを保持した。
- 2026-09-07 Issue #37のブログ全画面・分割エディタ変更後、`make check`（公開検査、UI契約、型、lint、unit、本番buildを含む）が成功。ローカルE2Eは実行環境にChromiumがなく、Playwright配布元からの取得がtimeoutしたため未実施。追加したPC分割配置・リアルタイム反映と既存のPC/390px journeyはPRのCI `e2e` で確認する。
- 2026-09-07 投稿詳細履歴変更では、実行環境からGitHubをcheckoutできないためローカル `make check` / `make e2e` は未実施。追加した投稿詳細URL・アプリ内戻る・ブラウザ戻る/進む・直接共有URLの回帰はPRのCI `check` / `e2e` / `container` で確認する。
- 2026-09-08 Issue #41の追従アクション変更は、CSS契約テストと1280px/390pxのPlaywright回帰で、PCの左sticky railとスマホの下部floating barがスクロール後も同位置に残ることをPR CIで確認する。
- 2026-09-07 Issue #45のトップページ変更後、`make check`（公開検査、UI契約、型、lint、unit、本番buildを含む）が成功。PCと390pxの匿名表示を実ブラウザで目視し、横方向の見切れがないことを確認した。ローカルE2Eは実行環境にPlaywright Chromiumがないため未実施し、トップからタイムラインへの導線を含むjourneyはPRのCI `e2e` で確認する。
- 2026-09-08 Issue #45のデザイン修正では、利用者の指示に従い大きなコピー、状態表示風の装飾、走査アニメーション、過剰な影と引用表現を削除した。`make check`が成功し、PCと390pxの匿名表示を実ブラウザで確認した。ローカルE2E用Chromiumは取得がtimeoutしたため、更新したjourneyはPRのCI `e2e` で確認する。
- 2026-09-08 Issue #45の経歴・閲覧数変更では、既存DBへの追加migration、閲覧数の永続・復元・投稿削除時消去、同一Origin拒否、公開API、閲覧数による人気投稿選択をunit/E2Eへ追加し、`make check`が成功した。PCと390pxの匿名表示を実ブラウザで確認した。ローカル `make e2e` はPlaywright Chromiumが未導入で起動前に失敗したため、PRのCI `e2e` で確認する。
- 2026-09-08 Issue #14 SEO変更では、実行環境からGitHubをcheckoutできないためローカル `make check` / `make e2e` は未実施。canonical・JSON-LD・robots・sitemap・404の回帰をunit/E2Eへ追加し、PRのCI `check` / `e2e` / `container` で確認する。公開環境の性能値はデプロイ後に `runbooks/seo.md` で再計測する。
- 2026-09-09 Issue #56の再調整では、青を主要色から外し、元の「タイムラインを見る」の墨色 `#37352f` を共通ボタン・選択状態・focus・リンクへ展開した。暖色の地と白い情報面、1px罫線でトップページとタイムラインを再構成し、コンテンツアイコンと年表示を元の控えめな表現へ戻して片側だけの強調罫線を削除した。`make check` とGitHub Actions run #192の `check` / `e2e` / `container` がすべて成功し、CIのPlaywright ChromiumでPC/390px表示を撮影してPRのスクリーンショットを更新した。

## 対象サーバーでのみ完了できる項目

- 実ドメインとTLS reverse proxy。
- 実機iOS/Androidでのパスキー、投稿モーダル初期フォーカス・ソフトウェアキーボード・フォーカス時自動ズームなし、横向き撮影、既存動画upload。
- 永続volumeから別ディレクトリへの復元訓練とオフホスト暗号化backup。
- GitHub required checks `check` / `e2e` / `container` の有効化。
- Cloudflare Tunnelを含むホスト再起動試験。
- SEO変更後の公開originでmobile / desktop LighthouseとCrUX INP、公開/直結TTFBを再計測する。

## 既知の制約

- 単一ホスト・単一writer向けで水平スケールは対象外。
- 投稿に紐付く前の孤児媒体は自動削除しない。容量監視し、GC実装前はDBを迂回して消さない。
- main UIの正式な変更は利用者の明示承認とUI baseline更新を必要とする。
- 自動deployはコードrollbackのみ。非互換DB migrationはbackupから別volumeへ手動復元する。
- deploy script/unitはroot領域の固定コピーであり、リポジトリ更新だけでは置換されない。単一appからblue/greenへの初回移行は、ADR 0011の容量条件を確認し、更新script/unitを再設置する計画作業である。

本番可否は `runbooks/deployment.md` の全項目で判定する。未実施項目を成功扱いしない。
