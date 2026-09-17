import { z } from "zod";

const postgresUrl = z.string().url().refine((value) => {
  const protocol = URL.parse(value)?.protocol;
  return protocol === "postgres:" || protocol === "postgresql:";
}, "PostgreSQL URL is required");

const databaseEnvironment = z.object({ DATABASE_URL: postgresUrl });

export function readDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const parsed = databaseEnvironment.safeParse(env);
  if (!parsed.success) {
    // Do not put connection strings or credentials into errors/logs.
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL. See .env.example.");
  }
  return parsed.data.DATABASE_URL;
}

export function readTestDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const result = postgresUrl.safeParse(env.TEST_DATABASE_URL);
  if (!result.success) throw new Error("TEST_DATABASE_URL must be explicitly configured.");
  const test = new URL(result.data);
  if (!decodeURIComponent(test.pathname).endsWith("_test")) {
    throw new Error("Integration database name must end with _test.");
  }
  if (env.DATABASE_URL) {
    const app = new URL(env.DATABASE_URL);
    if (test.hostname === app.hostname && (test.port || "5432") === (app.port || "5432") && test.pathname === app.pathname) {
      throw new Error("Integration tests must use a separate database.");
    }
  }
  return result.data;
}
