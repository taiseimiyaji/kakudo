import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { createDatabase } from "../db/client";
import { readE2eDatabaseUrl } from "../lib/e2e-env";
import { seedWorkspace } from "../modules/workspace/seed";
import { seedRoadmap } from "../modules/roadmap/seed";
import { seedResources } from "../modules/resource/seed";

async function main() {
  const url = readE2eDatabaseUrl(); // Fail before touching the DB or filesystem.
  const lock = postgres(url, { max: 1, connect_timeout: 5, onnotice: () => {} });
  let root: string | undefined;
  let release: (() => Promise<void>) | undefined;
  let ownsDatabase = false;
  async function reset() {
    await lock`DO $$ DECLARE item record; BEGIN
      FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('TRUNCATE TABLE public.%I CASCADE', item.tablename);
      END LOOP;
    END $$`;
  }
  try {
    const [row] = await lock`select pg_try_advisory_lock(43172, 1) as acquired`;
    if (!row.acquired) throw new Error("Another E2E run owns this database.");
    ownsDatabase = true;
    root = await mkdtemp(join(tmpdir(), "kakudo-e2e-"));
    const { db, client } = createDatabase(url);
    release = () => client.end();
    await migrate(db, { migrationsFolder: "./db/migrations" });
    await reset();
    await seedWorkspace(db); await seedRoadmap(db); await seedResources(db);
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
        stdio: "inherit", env: { ...process.env, DATABASE_URL: url, CONTENT_STORAGE_ROOT: root,
          KAKUDO_E2E_DATABASE_URL: url, KAKUDO_E2E_RUN: basename(root!), REVIEW_PROVIDER: "mock", SEARCH_PROVIDER: "mock" },
      });
      const stop = () => child.kill("SIGTERM");
      process.on("SIGINT", stop); process.on("SIGTERM", stop);
      child.once("error", reject);
      child.once("exit", (status) => { process.off("SIGINT", stop); process.off("SIGTERM", stop); resolve(status ?? 1); });
    });
    process.exitCode = code;
  } finally {
    try { if (ownsDatabase) await reset(); }
    finally {
      await release?.();
      await lock.end();
      if (root) await rm(root, { recursive: true, force: true });
    }
  }
}
main().catch(() => { console.error("Browser tests failed. Check the dedicated E2E configuration, database and port availability."); process.exitCode = 1; });
