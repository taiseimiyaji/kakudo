import "dotenv/config";
import { backup, restore } from "../modules/operations/backup";
import { readDatabaseUrl } from "../lib/env";

async function main() {
  const [action, path, flag] = process.argv.slice(2);
  if (!path || flag !== "--offline" || !["create", "restore"].includes(action)) {
    throw new Error("Usage: npm run backup -- create|restore DIRECTORY --offline (stop application and external editors first)");
  }
  if (action === "create") {
    await backup({ databaseUrl: readDatabaseUrl(), storageRoot: process.env.CONTENT_STORAGE_ROOT ?? "./workspace-data", destination: path });
  } else {
    if (!process.env.RESTORE_DATABASE_URL || !process.env.RESTORE_CONTENT_ROOT) throw new Error("Set RESTORE_DATABASE_URL and RESTORE_CONTENT_ROOT explicitly.");
    if (process.env.RESTORE_DATABASE_URL === process.env.DATABASE_URL) throw new Error("Do not restore over the active database.");
    await restore({ databaseUrl: readDatabaseUrl({ DATABASE_URL: process.env.RESTORE_DATABASE_URL }), storageRoot: process.env.RESTORE_CONTENT_ROOT, source: path });
  }
  console.log("Backup operation completed.");
}
main().catch(() => { console.error("Backup operation failed. Verify offline state, paths, checksums, PostgreSQL tools and empty restore destination. Existing backups are not overwritten."); process.exitCode = 1; });
