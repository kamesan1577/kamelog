import { Store } from "../server/store.mjs";
import { backupStore, restoreBackup } from "../server/backup.mjs";
const [action, source, target] = process.argv.slice(2);
const usage =
  "Usage:\n  node scripts/admin.mjs backup SOURCE_DATA EMPTY_BACKUP_DIR\n  node scripts/admin.mjs restore BACKUP_DIR EMPTY_DATA_DIR\n  node scripts/admin.mjs reset-auth SOURCE_DATA --confirm-reset-auth\n\nStop the application before running any command.";
if (!source || !["backup", "restore", "reset-auth"].includes(action)) {
  console.error(usage);
  process.exit(1);
}
if (action === "restore") {
  if (!target) {
    console.error(usage);
    process.exit(1);
  }
  await restoreBackup(source, target);
  console.log(
    "Restore completed; verify the restored copy before relying on it.",
  );
} else if (action === "backup") {
  if (!target) {
    console.error(usage);
    process.exit(1);
  }
  const store = new Store(source);
  try {
    await backupStore(store, target);
  } finally {
    store.close();
  }
  console.log("Backup completed; test restoration before relying on it.");
} else {
  if (target !== "--confirm-reset-auth") {
    console.error(
      "Refusing to remove credentials without --confirm-reset-auth.",
    );
    process.exit(1);
  }
  const store = new Store(source);
  try {
    const count = store.resetAuthentication();
    console.log(
      `Removed ${count} credential(s). Restart with a new bootstrap token and register replacement passkeys.`,
    );
  } finally {
    store.close();
  }
}
