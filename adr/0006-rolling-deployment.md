# ADR 0006: 常駐gatewayと2系統のアプリで更新する

## 状態

採用。

## 決定

公開ポート `127.0.0.1:3000` は常駐nginx gatewayだけがlistenし、`app-blue` と `app-green` へ振り分ける。更新imageは一度だけbuildし、片方を再作成して個別healthを確認してから、もう片方を再作成する。片方の更新中も他方が公開応答を継続する。

更新前backupはアプリを停止せずSQLite backup APIでDB snapshotを作成し、そのsnapshotが参照する媒体をコピーする。媒体ファイルはDB登録前に確定し、登録後は変更・削除しないため、snapshot済みDBが参照するファイルはコピー中も不変である。余分な未参照媒体が混入しても復元整合性を損なわない。

2系統は同じSQLiteと媒体volumeを共有する。SQLite WAL、busy timeout、revision競合を維持する。将来のschema変更は旧新releaseの同時稼働に互換なexpand/contract方式を必須とし、非互換migrationはこの方式で自動配布しない。

## 対象ホストの容量判断

2026-09-10に対象ホストで確認した値は、Intel Core i3-4130（2 core/4 thread）、RAM 7.7GiB（available 5.0GiB）、swap 4.0GiB、root filesystem 110GiB中15GiB空きである。現行appはidle時約66MiB、12 PIDだった。

分離環境での実測はblue 51.45MiB、green 51.62MiB、nginx 9.91MiBの合計約113MiBで、現状からの増分は約47MiB。設定上の上限はapp各1GiBとgateway 128MiBの合計2.125GiBであり、available memory内に収まる。動画変換は各app最大2 threadを使うため、同時変換時は4論理CPUを使い切り得るが、単一オーナー運用では許容する。

ディスクは使用率86%で余裕が小さい。Docker build cache 37.48GB中29.7GBが回収可能だったが、自動削除はしない。deployは10GiB未満ならbuild前に停止し、運用者が対象を確認してcache整理する。

## 帰結

通常更新時の接続拒否をなくせる一方、常時約1 app分のRAMを追加使用する。gatewayまたはホスト自体の障害は単一障害点のままである。旧単一app構成からの初回移行だけは、固定deploy scriptとsystemd unitを更新する計画作業が必要である。
