import { isAbsolute, basename } from "node:path";
import { readDatabaseUrl } from "./env";

export function readE2eDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (!env.E2E_DATABASE_URL) throw new Error("E2E_DATABASE_URL must be explicitly configured.");
  const result = readDatabaseUrl({ DATABASE_URL: env.E2E_DATABASE_URL });
  const name = decodeURIComponent(new URL(result).pathname);
  if (!name.endsWith("_e2e_test")) throw new Error("E2E database name must end with _e2e_test.");
  for (const url of [env.DATABASE_URL, env.TEST_DATABASE_URL]) {
    // Deliberately compare names across hosts too: aliases must not bypass isolation.
    if (url && decodeURIComponent(new URL(url).pathname) === name) throw new Error("E2E must use a separate database name.");
  }
  return result;
}

export function requireE2eRunner(env: NodeJS.ProcessEnv = process.env) {
  const root = env.CONTENT_STORAGE_ROOT;
  if (!env.KAKUDO_E2E_RUN || !root || !isAbsolute(root) || basename(root) !== env.KAKUDO_E2E_RUN
    || !env.KAKUDO_E2E_DATABASE_URL || env.DATABASE_URL !== env.KAKUDO_E2E_DATABASE_URL) {
    throw new Error("Run browser tests with npm run test:browser; direct server reuse is forbidden.");
  }
}
