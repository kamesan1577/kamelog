# ADR-0001: Node.jsとSQLiteの単一ホスト構成

状態: 採用

既存React UIをそのまま使い、Next.jsのNode runtimeにAPIを置く。
SQLiteはNode.js 24の組み込みドライバーを使い、媒体は同一永続volumeに保存する。
Sites固有の認証・DB binding・worker設定は実運用経路から外す。
UIの置換や別言語のAPIを同時に導入するより、既存型と表示契約を共有しやすい。
単一writer、SQLite WAL、短いtransaction、bounded uploadを前提とし水平スケールは対象外。
FFmpegは子プロセスで引数配列を使い、尺・サイズ・実行時間・並列数を制限する。
