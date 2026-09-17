import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../db/client";
import { readDatabaseUrl } from "../lib/env";

async function main() {
  const { db, client } = createDatabase(readDatabaseUrl());
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    console.log("Database migrations applied.");
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Migration failed. Check database connectivity and migration files.");
  process.exitCode = 1;
});
