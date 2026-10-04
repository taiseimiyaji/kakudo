import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect, it } from "vitest";
import { createDatabase } from "../../db/client";
import { workspaces, documentWriteIntents, quotes } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { documentService } from "../../modules/document/service";
import { revisionService } from "../../modules/revision/service";
import { LocalFileSystemStorage } from "../../modules/storage/local";

it("rejects stale body saves, quotes and renames after a title-only save", async () => {
  const { db, client } = createDatabase(readTestDatabaseUrl());
  const workspaceId = `title-conflict-${randomUUID()}`;
  const root = await mkdtemp(join(tmpdir(), "kakudo-title-conflict-"));
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    await db.insert(workspaces).values({ id: workspaceId, name: "Title conflict" });
    const storage = new LocalFileSystemStorage(root);
    const docs = documentService(db, storage);
    for (const operation of ["body", "quote", "title"]) {
      const doc = await docs.create(workspaceId, { title: "Old", content: "A", nodeIds: [] });
      const old = await docs.get(doc.id, workspaceId);
      const base = { baseHash: old.contentHash, baseWriteId: old.document.lastWriteId };
      await docs.save(doc.id, workspaceId, { title: "New", content: "A", ...base });
      const stale = operation === "quote"
        ? docs.quote(doc.id, workspaceId, { title: "Old", content: "A", ...base, text: "Reference", sourceUrl: "https://example.com", from: 1, to: 1 })
        : docs.save(doc.id, workspaceId, { title: operation === "title" ? "Other" : "Old", content: operation === "body" ? "B" : "A", ...base });
      await expect(stale).rejects.toMatchObject({ status: 409 });
      const latest = await docs.get(doc.id, workspaceId);
      expect(latest.document.title).toBe("New"); expect(latest.content).toBe("A");
      expect(await revisionService(db).list(doc.id, workspaceId)).toHaveLength(1);
      expect(await db.select().from(quotes).where(eq(quotes.documentId, doc.id))).toHaveLength(0);
      expect(await db.select().from(documentWriteIntents)).toHaveLength(0);
      await docs.remove(doc.id, workspaceId);
    }
  } finally {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    await client.end(); await rm(root, { recursive: true, force: true });
  }
});
