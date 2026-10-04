import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createDatabase } from "../../db/client";
import { workspaces, documents, documentWriteIntents } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { LocalFileSystemStorage } from "../../modules/storage/local";
import { documentService } from "../../modules/document/service";
import { createApp } from "../../server/app";
import { findWorkspace } from "../../modules/workspace/service";
import { requestCreation } from "../../client/creation-request";
import { UnknownMutationOutcome } from "../../client/api";
import { documentSchema } from "../../shared/document";

it.each(["before", "after"] as const)("keeps note creation uncertain when recovery fails %s DB commit", async (timing) => {
  const { db, client } = createDatabase(readTestDatabaseUrl());
  const workspaceId = `creation-recovery-${randomUUID()}`;
  const root = await mkdtemp(join(tmpdir(), "kakudo-create-recovery-"));
  const storage = new LocalFileSystemStorage(root);
  let healthy = false; let writes = 0;
  const failingStorage = {
    read: storage.read.bind(storage), exists: storage.exists.bind(storage),
    async write(path: string, content: string) {
      writes++;
      if (!healthy && (timing === "before" || writes > 1)) throw new Error("private storage recovery failure");
      await storage.write(path, content);
    },
    async delete(path: string) { if (!healthy) throw new Error("private rollback failure"); await storage.delete(path); },
  };
  const originalTransaction = db.transaction.bind(db);
  const transaction = vi.spyOn(db, "transaction");
  if (timing === "after") transaction.mockImplementation(async (...args) => {
    await originalTransaction(...args); // Real transaction commits; only its acknowledgment is lost.
    throw new Error("private lost commit acknowledgment");
  });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    await db.insert(workspaces).values({ id: workspaceId, name: "Creation recovery" });
    const app = createApp({ database: () => db, storage: () => failingStorage, findWorkspace: (id) => findWorkspace(id, db), checkDatabase: async () => {} });
    const response = await app.request(`/api/documents?workspaceId=${workspaceId}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:43171" }, body: JSON.stringify({ title: "Human title", content: "Human prose", nodeIds: [] }) });
    expect(response.status).toBe(409);
    const rows = await db.select().from(documents).where(eq(documents.workspaceId, workspaceId));
    expect(rows).toHaveLength(timing === "after" ? 1 : 0);
    expect(await db.select().from(documentWriteIntents)).toHaveLength(1);
    if (rows.length) expect(await storage.read(rows[0].path)).toBe("Human prose");
    vi.stubGlobal("fetch", vi.fn(async () => response.clone()));
    await expect(requestCreation(`/documents?workspaceId=${workspaceId}`, {}, z.object({ document: documentSchema }))).rejects.toBeInstanceOf(UnknownMutationOutcome);
    expect(await response.json()).toMatchObject({ code: "DOCUMENT_CREATE_OUTCOME_UNKNOWN" });
    healthy = true; transaction.mockRestore();
    const list = await documentService(db, storage).list(workspaceId);
    expect(list).toHaveLength(timing === "after" ? 1 : 0);
    expect(await db.select().from(documentWriteIntents)).toHaveLength(0);
  } finally {
    healthy = true; transaction.mockRestore(); vi.unstubAllGlobals();
    await documentService(db, storage).recover();
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await client.end(); await rm(root, { recursive: true, force: true });
  }
});
