# SEO / Web性能確認 runbook

対象はデプロイ済みの公開origin。既定は `https://kamesan.org`。

## 1. 検索向けエンドポイント

```sh
ORIGIN=https://kamesan.org
curl -fsS "$ORIGIN/robots.txt"
curl -fsS "$ORIGIN/sitemap.xml"
curl -fsS "$ORIGIN/" | grep -E 'canonical|application/ld\+json|og:url|twitter:url'
```

確認事項:

- robotsが公開ページを許可し、`/api/` と `/setup` を除外している。
- robotsのSitemapが同じ公開originを指す。
- sitemapにホームと公開ブログだけが含まれる。
- canonical / OGP / Twitter / JSON-LDにlocalhostがない。

## 2. TTFB

外側のCloudflare Tunnelを含む値を5回取る。

```sh
for i in 1 2 3 4 5; do
  curl -o /dev/null -sS \
    -w 'status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
    https://kamesan.org/
done
```

対象ホスト上でもアプリへ直接5回実行し、公開originとの差を分ける。

```sh
for i in 1 2 3 4 5; do
  curl -o /dev/null -sS \
    -w 'status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s\n' \
    http://127.0.0.1:3000/
done
```

公開側だけ遅い場合はTunnel / reverse proxy側、両方遅い場合はアプリ / SQLite読み出し側を優先して調べる。

## 3. Lighthouse

Chromeが使える端末でmobile / desktopを別々に保存する。リポジトリへ巨大なreport本体はcommitしない。

```sh
ORIGIN=https://kamesan.org
npx --yes lighthouse "$ORIGIN/" \
  --only-categories=performance,seo \
  --output=json \
  --output-path=/tmp/kamelog-lighthouse-mobile.json \
  --chrome-flags='--headless'

npx --yes lighthouse "$ORIGIN/" \
  --preset=desktop \
  --only-categories=performance,seo \
  --output=json \
  --output-path=/tmp/kamelog-lighthouse-desktop.json \
  --chrome-flags='--headless'
```

最低限、LCPとCLSを記録する。LighthouseのTotal Blocking TimeをINPとして記録しない。

## 4. INP / CrUX

INPはPageSpeed InsightsのCrUX field dataで確認する。十分な実利用データがなくINPが表示されない場合は `unavailable` と記録し、別指標で置き換えて合格扱いしない。

PageSpeed Insights APIを使う場合はmobile / desktopを分ける。429の場合は再試行を連打せず、ブラウザ版または別の時間帯で確認する。

## 5. 記録テンプレート

| date | target | strategy | LCP | INP | CLS | TTFB | note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | home | mobile |  |  |  |  |  |
| YYYY-MM-DD | home | desktop |  |  |  |  |  |

目標:

- LCP: 2.5秒以下
- INP: 200ms以下
- CLS: 0.1以下

値を取得できなかった項目は空欄にせず `unavailable` と理由を残す。
