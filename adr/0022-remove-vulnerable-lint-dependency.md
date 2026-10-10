# ADR 0022: Next.js lint の脆弱な推移依存を取り除く

## 状態

採用。対象は単一ルートの現在のリポジトリ。

## 背景

`@next/eslint-plugin-next@16.3.8` は `fast-glob` → `micromatch` → `braces@3.0.3` を開発依存として取り込む。
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) の修正版は調査時点で公開されていない。
Next.js の lint ルールを削除せず、この依存経路を取り除く。

## 決定

npm のバージョン限定 override で、`@next/eslint-plugin-next@16.3.8` の `fast-glob` だけを `npm:tinyglobby@0.2.17` に置き換える。
`tinyglobby` は既存の開発依存にも含まれるパッケージであり、Next.js、ESLint、ルール設定は更新・削除しない。

この置換を汎用的な互換実装とは扱わない。
`tinyglobby` は静的ディレクトリの展開、絶対パスの返し方、ゼロ埋め・刻み付きの波括弧範囲で `fast-glob` と異なる。
現在の設定では `settings.next.rootDir` を指定しておらず、Next.js は `context.cwd` を使うため glob 関数を呼ばない。
この条件を回帰テストで固定する。

テストは実効設定に独自の `next.rootDir` がないこと、Next.js の既存ルールが有効であること、内部リンクと同期 script の検出を確認する。
依存のバージョンと Next.js 内の呼び出し箇所も固定し、上流の使い方が変わったら検査を失敗させる。
将来 monorepo 等で `rootDir` を追加する場合は、この置換をそのまま使わず、上流の対応版か互換性を検証した方式へ変更する。
上流が脆弱な依存経路を解消したら override と専用の制約テストを取り除く。

併せて通常の修正版へ `sharp` を 0.35.5、`source-map-js` を 1.2.2 に更新する。
対応する advisory はそれぞれ [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w)、[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。

## 検証と運用

CI の `npm audit --audit-level=high` は変更しない。advisory の除外、PR 限定の免除、本番依存だけに絞る検査は導入しない。
クリーンな `npm ci`、依存監査、lint の診断比較、通常の全検証を行う。
本番のデータ形式・API・実行時設定は変更しない。
