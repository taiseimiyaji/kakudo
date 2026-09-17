import "dotenv/config";
import { seedRoadmap } from "../modules/roadmap/seed";
import { createDatabase } from "../db/client";
import { readDatabaseUrl } from "../lib/env";
import { seedWorkspace } from "../modules/workspace/seed";

async function main() {
  const { db, client } = createDatabase(readDatabaseUrl());
  try {
    await seedWorkspace(db);
    await seedRoadmap(db);
    console.log("Default workspace ready.");
  } finally {
    await client.end();
  }
}
main().catch(() => {
  console.error("Seed failed. Run database migrations and check connectivity.");
  process.exitCode = 1;
});
