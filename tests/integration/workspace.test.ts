import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import { workspaceResponseSchema } from "../../shared/workspace";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../../db/client";
import { workspaces } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { seedWorkspace } from "../../modules/workspace/seed";
import { findWorkspace } from "../../modules/workspace/service";

// Fail rather than skip or fall back to the user's application database.
const { db, client } = createDatabase(readTestDatabaseUrl());

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await db.delete(workspaces).where(eq(workspaces.id, "default"));
});
afterAll(async () => {
  await db.delete(workspaces).where(eq(workspaces.id, "default"));
  await client.end();
});

describe("workspace persistence with PostgreSQL", () => {
  it("seeds idempotently and preserves existing user data", async () => {
    await seedWorkspace(db);
    const first = await findWorkspace("default", db);
    expect(first?.name).toBe("My Knowledge Workspace");
    expect(first?.createdAt).toBeInstanceOf(Date);
    await db.update(workspaces).set({ name: "My learning" }).where(eq(workspaces.id, "default"));
    await Promise.all([seedWorkspace(db), seedWorkspace(db)]);
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, "default"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("My learning");
    expect(rows[0].createdAt).toEqual(first?.createdAt);
  });
  it("exposes persisted workspace and health through the Hono API", async () => {
    await seedWorkspace(db);
    const app = createApp({
      findWorkspace: (id) => findWorkspace(id, db),
      checkDatabase: async () => { await db.execute(sql`select 1`); },
    });
    const response = await app.request("/api/workspaces/default");
    expect(response.status).toBe(200);
    const payload = workspaceResponseSchema.parse(await response.json());
    expect(payload.workspace.id).toBe("default");
    expect(payload.workspace.name).toBe((await findWorkspace("default", db))?.name);
    expect((await app.request("/api/workspaces/missing")).status).toBe(404);
    expect((await app.request("/api/health")).status).toBe(200);
  });
  it("returns null for a missing workspace", async () => {
    expect(await findWorkspace("missing", db)).toBeNull();
  });
});
