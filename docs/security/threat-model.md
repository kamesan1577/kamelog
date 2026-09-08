# 脅威モデル

| 境界         | 脅威                                      | 対策                                                                              |
| ------------ | ----------------------------------------- | --------------------------------------------------------------------------------- |
| WebAuthn     | 偽署名、challenge再利用、別Origin         | 実ライブラリ検証、5分/単回、ceremony cookie、UV必須                               |
| API          | 未認証書込、CSRF、過大body                | session検証、Origin必須、JSON上限、rate limit                                     |
| 閲覧数       | 水増し、閲覧者の追跡                      | 同一Origin、専用rate limit、合計値のみ保存、IP・閲覧者識別子を保存しない          |
| 下書き       | 公開responseやcacheへ漏洩                 | owner専用、全API no-store、公開projectionを明示                                   |
| 媒体         | traversal、偽形式、画像bomb、CPU/容量枯渇 | opaque ID、magic/dimension検証、bounded FFmpeg、サイズ/画素数/並列数制限          |
| Markdown     | script実行、危険URL、図へのコード混入     | HTML無効、URL allowlist、React escaping、Mermaid strict mode、埋め込みhost/id検証 |
| バックアップ | 不整合、改竄、上書き                      | DB backup、hash manifest、空復元先、停止中操作                                    |
| 運用         | proxy偽装、秘密露出                       | HTTPS Origin固定、cookie Secure、proxyでrequest上限、汎用エラー                   |

公開前に認証E2E、実媒体変換、別環境復元、コンテナ起動を通す。
一般的なgrepは網羅的な個人情報判定ではない。公開用fixtureと無出力private marker検査を併用する。
