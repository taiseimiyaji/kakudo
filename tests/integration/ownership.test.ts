import { expect, it, vi } from "vitest";
import postgres from "postgres";
import { readTestDatabaseUrl } from "../../lib/env";
import { acquireOwnership } from "../../modules/operations/ownership";

it("excludes a second process until the database owner releases its lease", async () => {
  const url = readTestDatabaseUrl(); const lost = vi.fn();
  const release = await acquireOwnership(url, lost);
  try { await expect(acquireOwnership(url, vi.fn())).rejects.toThrow("Another Kakudo"); }
  finally { await release(); }
  const next = await acquireOwnership(url, lost); await next();
  expect(lost).not.toHaveBeenCalled();
});

it("reports loss of the owning session so the app can stop instead of silently reconnecting", async () => {
  const url = readTestDatabaseUrl(); const lost = vi.fn();
  const admin = postgres(url, { max: 1 });
  const release = await acquireOwnership(url, lost);
  try {
    await admin`select pg_terminate_backend(pid) from pg_locks where locktype='advisory' and classid=43171 and objid=1 and database=(select oid from pg_database where datname=current_database())`;
    await vi.waitFor(() => expect(lost).toHaveBeenCalled(), { timeout: 3000 });
  } finally { await release(); await admin.end(); }
});
