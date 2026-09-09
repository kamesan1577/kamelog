# SEO / 検索エンジン向け公開仕様

## 公開URL

- 公開URLのoriginは `KAMELOG_ORIGIN` を正本とする。
- 本番実行時にloopback originが設定されていても、canonical・OGP・Twitter URL・robots・sitemapへlocalhostを出さず、公開既定値 `https://kamesan.org` を使う。
- ホームのcanonicalは常に `/` とする。
- 投稿詳細は既存の `/?post=<id>` をcanonicalとし、`preview` / `embed` など表示用クエリをcanonicalへ含めない。
- `preview=1` / `embed=1` は検索対象にしない。
- 存在しない `post` IDは404として扱う。

## robots / sitemap

- `/robots.txt` は公開ページを許可し、`/api/` と `/setup` を除外する。
- `/robots.txt` は `/sitemap.xml` の公開URLを示す。
- `/sitemap.xml` はホームと公開済みブログを列挙する。
- つぶやき・vlogは現時点では主な検索流入対象にせずsitemapへ含めない。
- ブログの初回公開日時は保存済み `date` を `createdAt` 相当として扱い、最終更新日時 `updatedAt` があれば `lastModified` に優先する。
- 削除済み・下書き・存在しない投稿をsitemapへ含めない。

## メタデータ / 構造化データ

- ホームは `WebSite` と公開プロフィール範囲の `Person` JSON-LDを出力する。
- `sameAs` は実際に公開しているプロフィールURLだけを使う。
- ブログ詳細は `BlogPosting` JSON-LDを出力し、`headline`、本文から生成した `description`、`datePublished`、`dateModified`、`author`、`mainEntityOfPage`、OGPと同一の `image` を含める。
- つぶやき・vlogへ `BlogPosting` / `Article` を誤適用しない。
- ブログのcanonical・OGP URL・`twitter:url`・JSON-LDのURLは同じ正規URLへ揃える。
- JSON-LDへ下書き、認証情報、非公開設定を含めない。

## 性能確認

本番でのLCP / INP / CLS / TTFB確認は `runbooks/seo.md` に従う。Lighthouseのlab値とCrUXのfield値を混同せず、取得できない値を合格扱いしない。
