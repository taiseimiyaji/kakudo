import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readDatabaseUrl } from "../lib/env";
import * as schema from "./schema";

export function createDatabase(url: string) {
  const client = postgres(url, { max: 5, connect_timeout: 5, idle_timeout: 20, connection: { statement_timeout: 15000 } });
  return { db: drizzle(client, { schema }), client };
}

export type Database = ReturnType<typeof createDatabase>["db"];
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const globalDatabase = globalThis as unknown as {
  kakudoDatabase?: ReturnType<typeof createDatabase>;
};

export function getDatabase(): Database {
  // Lazy connection: builds do not require a running database or secrets.
  globalDatabase.kakudoDatabase ??= createDatabase(readDatabaseUrl());
  return globalDatabase.kakudoDatabase.db;
}

export async function closeDatabase(): Promise<void> {
  await globalDatabase.kakudoDatabase?.client.end();
  delete globalDatabase.kakudoDatabase;
}
