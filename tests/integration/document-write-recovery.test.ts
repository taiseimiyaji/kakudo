import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect, it, vi } from "vitest";
import { createDatabase } from "../../db/client";
import { workspaces, documents, quotes, documentWriteIntents } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { LocalFileSystemStorage } from "../../modules/storage/local";
import { documentService } from "../../modules/document/service";
import { revisionService } from "../../modules/revision/service";
import { createApp } from "../../server/app";
import { findWorkspace } from "../../modules/workspace/service";
import { NoteSession, UnknownNoteWriteOutcome } from "../../modules/editor/note-session";
import { saveNote, quoteNote } from "../../client/note-write";

for (const operation of ["save", "quote"] as const) for (const timing of ["before", "after"] as const)
  it(`${operation} recovery failure ${timing} actual DB commit stays unknown and blocks replay`, async () => {
    const { db, client } = createDatabase(readTestDatabaseUrl());
    const workspaceId = `write-recovery-${randomUUID()}`;
    const root = await mkdtemp(join(tmpdir(), "kakudo-write-recovery-"));
    const storage = new LocalFileSystemStorage(root);
    let healthy = true; let writes = 0;
    const failingStorage = {
      read: storage.read.bind(storage), exists: storage.exists.bind(storage), delete: storage.delete.bind(storage),
      async write(path: string, content: string) {
        writes++;
        if (!healthy && (timing === "before" || writes > 1)) throw new Error("private recovery failure");
        await storage.write(path, content);
      },
    };
    const originalTransaction = db.transaction.bind(db);
    const transaction = vi.spyOn(db, "transaction");
    try {
      await migrate(db, { migrationsFolder: "./db/migrations" });
      await db.insert(workspaces).values({ id: workspaceId, name: "Owned write recovery" });
      const doc = await documentService(db, storage).create(workspaceId, { title: "人間の元の名前", content: "人間の本文。", nodeIds: [] });
      const initial = await documentService(db, storage).get(doc.id, workspaceId);
      const title = "人間が変えた名前";
      // A title-only save preserves the hash, so stale-write protection must use write ID.
      const draft = { title, content: initial.content, baseHash: initial.contentHash, baseWriteId: doc.lastWriteId };
      const quote = { ...draft, text: "人間が選んだ引用。", sourceUrl: "https://example.com/reference", sourceTitle: "人間の出典", from: initial.content.length, to: initial.content.length };
      healthy = false; writes = 0;
      if (timing === "after") transaction.mockImplementation(async (...args) => { await originalTransaction(...args); throw new Error("private lost commit acknowledgment"); });
      const app = createApp({ database: () => db, storage: () => failingStorage, findWorkspace: id => findWorkspace(id, db), checkDatabase: async () => {} });
      const path = `/api/documents/${doc.id}${operation === "quote" ? "/quotes" : ""}?workspaceId=${workspaceId}`;
      const send = () => app.request(path, { method: operation === "save" ? "PUT" : "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:43171" }, body: JSON.stringify(operation === "save" ? draft : quote) });
      const response = await send();
      expect(response.status).toBe(409);
      const [stored] = await db.select().from(documents).where(eq(documents.id, doc.id));
      expect(stored.lastWriteId === doc.lastWriteId).toBe(timing === "before");
      expect(stored.title).toBe(timing === "after" ? title : doc.title);
      expect(await db.select().from(documentWriteIntents)).toHaveLength(1);
      expect(await db.select().from(quotes).where(eq(quotes.documentId, doc.id))).toHaveLength(operation === "quote" && timing === "after" ? 1 : 0);
      expect(await response.clone().json()).toMatchObject({ code: "DOCUMENT_WRITE_OUTCOME_UNKNOWN" });

      const fetch = vi.fn(async () => response.clone()); vi.stubGlobal("fetch", fetch);
      const session = new NoteSession({ title: doc.title, content: initial.content, hash: initial.contentHash, writeId: doc.lastWriteId, revisionId: doc.currentRevisionId }, data => saveNote(workspaceId, doc.id, data));
      session.edit({ title });
      const apply = vi.fn();
      if (operation === "save") { expect(await session.save(true)).toBe(false); expect(await session.save(true)).toBe(false); }
      else for (let attempt = 0; attempt < 2; attempt++) await expect(session.addQuote(initial.content, data => quoteNote(workspaceId, doc.id, { ...quote, ...data }), apply)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
      session.tick();
      expect(fetch).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
      expect(session.getSnapshot()).toMatchObject({ title, content: initial.content, outcomeUnknown: true, retryRequired: true, saving: false });
      expect(session.getSnapshot().error).not.toContain("private");
      expect((await app.request(`/api/documents/${doc.id}?workspaceId=${workspaceId}`)).status).toBe(500);

      healthy = true; transaction.mockRestore();
      const recovered = await documentService(db, failingStorage).get(doc.id, workspaceId);
      expect(await db.select().from(documentWriteIntents)).toHaveLength(0);
      expect(recovered.contentHash === initial.contentHash).toBe(operation === "save" || timing === "before");
      // A GET, even one showing this committed write, cannot clear the client hold.
      expect(session.getSnapshot().outcomeUnknown).toBe(true);
      if (timing === "after") {
        const stale = await send(); expect(stale.status).toBe(409);
        expect(await stale.json()).not.toHaveProperty("code");
      }
      expect(await db.select().from(quotes).where(eq(quotes.documentId, doc.id))).toHaveLength(operation === "quote" && timing === "after" ? 1 : 0);
      expect(await revisionService(db).list(doc.id, workspaceId)).toHaveLength(operation === "quote" && timing === "after" ? 2 : 1);
      session.acceptBase({ title: recovered.document.title, content: recovered.content, hash: recovered.contentHash, writeId: recovered.document.lastWriteId, revisionId: recovered.document.currentRevisionId });
      session.tick(); expect(fetch).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot()).toMatchObject({ title, content: initial.content, outcomeUnknown: false, retryRequired: true });
    } finally {
      healthy = true; transaction.mockRestore(); vi.unstubAllGlobals();
      await documentService(db, storage).recover(); await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
      await client.end(); await rm(root, { recursive: true, force: true });
    }
  });
