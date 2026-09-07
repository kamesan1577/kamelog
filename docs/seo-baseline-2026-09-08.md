# SEO baseline — 2026-09-08

Issue #14着手前に外部から確認できた状態を記録する。

<!-- prettier-ignore -->
| item | result |
| --- | --- |
| `/robots.txt` | 200 |
| `/sitemap.xml` | 404 |
| top canonical | なし |
| JSON-LD | なし |
| SSR | 本文・見出しを初期HTMLで確認 |
| title / description | あり |
| OGP / Twitter Card | あり |
| top HTML | 約62KB |
| TTFB | 外部観測で約12〜14秒となる場合あり |
| PageSpeed Insights API | 429のため取得不可 |
| LCP / INP / CLS | 未取得 |

この文書は変更前baselineであり、変更後の性能値を推測しない。デプロイ後に `runbooks/seo.md` のmobile / desktop手順で再計測し、取得できないfield dataは `unavailable` と理由を記録する。
