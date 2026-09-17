# UI visual evidence

このディレクトリは、CIのChromiumで実際に描画した画面全体の証跡です。

- CI run: [35201584982](https://github.com/kamesan1577/kamelog/actions/runs/35201584982)
- 対象commit: `db274bc`
- 公開ページ: ホーム、タイムライン、プロジェクト、ActivityPub案内、404
- 各公開ページ: 390px（mobile）、768px（tablet）、1440px（desktop）
- 認証後の主要状態: アカウント mobile/desktop、投稿エディタ mobile、Fediverse mobile
- すべて `fullPage: true` で撮影

## 公開ページ

| Page | Mobile | Tablet | Desktop |
| --- | --- | --- | --- |
| Home | [PNG](./visual-evidence-home-mobile.png) | [PNG](./visual-evidence-home-tablet.png) | [PNG](./visual-evidence-home-desktop.png) |
| Timeline | [PNG](./visual-evidence-timeline-mobile.png) | [PNG](./visual-evidence-timeline-tablet.png) | [PNG](./visual-evidence-timeline-desktop.png) |
| Projects | [PNG](./visual-evidence-projects-mobile.png) | [PNG](./visual-evidence-projects-tablet.png) | [PNG](./visual-evidence-projects-desktop.png) |
| Federation | [PNG](./visual-evidence-federation-mobile.png) | [PNG](./visual-evidence-federation-tablet.png) | [PNG](./visual-evidence-federation-desktop.png) |
| Not found | [PNG](./visual-evidence-not-found-mobile.png) | [PNG](./visual-evidence-not-found-tablet.png) | [PNG](./visual-evidence-not-found-desktop.png) |

## 認証後の主要状態

| State | Screenshot |
| --- | --- |
| Account mobile | [PNG](./screen-evidence-account-mobile.png) |
| Account desktop | [PNG](./screen-evidence-account-desktop.png) |
| Editor mobile | [PNG](./screen-evidence-editor-mobile.png) |
| Fediverse timeline mobile | [PNG](./screen-evidence-fediverse-mobile.png) |

主要コンポーネント（Button、PageHeader、PostCard、ProjectList、MobileNavigation）は、既存の
[visual baselines](../../../tests/visual/design-system.spec.ts-snapshots/)を390/768/1440pxでCI比較しています。
