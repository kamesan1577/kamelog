# ADR 0017: AIによるスレッド接続は明示親と別に保存する

## 状態

採用。

## 決定

空リプの推論結果は `inferred_thread_links` に保存し、既存投稿の `parentId` を変更しない。read projectionは `effectiveParentId = parentId ?? inferred parentId` とする。明示した返信、拒否済みのAIリンク、候補外・未来・循環の親は自動処理しない。

新規投稿と推論ジョブは同一SQLite transactionで保存する。投稿レスポンスは待たず、timerのoneshot workerが後で `ThreadInference` を実行する。失敗時は他のLLMへ送らず、未連結を維持する。
