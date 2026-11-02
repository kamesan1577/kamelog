import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  cancelMigration,
  exportCloudArchive,
  GatewayMigrationTarget,
  migrateStorage,
  restoreStorageArchive,
  verifyArchive,
} from "../server/storage/migration.ts";
import { StorageError } from "../server/storage/errors.ts";

const [action, source, target, acknowledgement] = process.argv.slice(2);
const usage = `Usage:
  node scripts/migrate-storage.ts migrate SOURCE_DATA EMPTY_BACKUP_DIR --stopped
  node scripts/migrate-storage.ts export SOURCE_DATA EMPTY_BACKUP_DIR --stopped
  node scripts/migrate-storage.ts restore BACKUP_DIR EMPTY_DATA_DIR --stopped
  node scripts/migrate-storage.ts cancel SOURCE_DATA --stopped
  node scripts/migrate-storage.ts verify BACKUP_DIR

Stop both application instances and every worker before migrate/export/restore/cancel.
Cloud commands read KAMELOG_STORAGE_ENDPOINT and KAMELOG_STORAGE_TOKEN from the environment.
Never pass tokens on the command line. A failed migration remains fenced; rerun the
same command to resume, or use cancel to return to the untouched local source.`;

try {
  if (
    !source ||
    !["migrate", "export", "restore", "cancel", "verify"].includes(action)
  )
    throw new StorageError("storage_configuration");
  if (
    action !== "verify" &&
    (action === "cancel" ? target : acknowledgement) !== "--stopped"
  )
    throw new StorageError("storage_configuration");
  if (["migrate", "export", "restore"].includes(action) && !target)
    throw new StorageError("storage_configuration");
  if (action === "migrate" || action === "export") {
    const endpoint = process.env.KAMELOG_STORAGE_ENDPOINT || "";
    const token = process.env.KAMELOG_STORAGE_TOKEN || "";
    if (action === "migrate") {
      await migrateStorage({
        source,
        backupDirectory: target,
        target: (generation) =>
          new GatewayMigrationTarget({ endpoint, token, generation }),
      });
      console.log(
        "移行先の全DBデータと媒体を検証し、保存先を切り替えました。元データとバックアップは保持しています。",
      );
    } else {
      const selector = z
        .object({
          version: z.literal(1),
          provider: z.literal("cloudflare"),
          generation: z.uuid(),
        })
        .strict()
        .parse(
          JSON.parse(await readFile(join(source, "storage.json"), "utf8")),
        );
      await exportCloudArchive(
        { endpoint, token, generation: selector.generation },
        target,
      );
      console.log(
        "Cloudflareのデータを、別の保存先へ復元できるSQLiteと媒体のバックアップに出力しました。",
      );
    }
  } else if (action === "restore") {
    await restoreStorageArchive(source, target);
    console.log("整合性を検証し、空のローカル保存先へ復元しました。");
  } else if (action === "cancel") {
    await cancelMigration(source);
    console.log(
      "移行を中止し、元のローカル保存先を再開できる状態にしました。コピー先とバックアップは保持しています。",
    );
  } else {
    await verifyArchive(source);
    console.log("バックアップの全DBデータ、媒体、参照を検証しました。");
  }
} catch (error) {
  // Paths, private content and remote error bodies must not reach operational logs.
  const code = error instanceof StorageError ? error.code : "storage_integrity";
  console.error(
    `保存先の操作を完了できませんでした (${code})。移行前のデータは削除していません。`,
  );
  if (code === "storage_configuration") console.error(usage);
  process.exitCode = 1;
}
