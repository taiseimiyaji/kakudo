import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase, type Database, type DatabaseTransaction } from "../../db/client";
import { documents, documentRevisions } from "../../db/schema";
import { contentHash } from "../document/hash";
import { needsRevision } from "../../shared/revision";
import { requireFound } from "../../lib/errors";

export async function appendRevision(tx: DatabaseTransaction, documentId: string, content: string): Promise<string> {
  const [document] = await tx.select().from(documents).where(eq(documents.id, documentId));
  requireFound(document, "Document");
  const hash = contentHash(content);
  const previous = document.currentRevisionId ? (await tx.select().from(documentRevisions).where(and(eq(documentRevisions.id, document.currentRevisionId), eq(documentRevisions.documentId, documentId))))[0] : undefined;
  if (previous && !needsRevision(previous.contentHash, hash)) return previous.id;
  const id = randomUUID();
  await tx.insert(documentRevisions).values({ id, documentId, contentHash: hash, contentSnapshot: content });
  await tx.update(documents).set({ currentRevisionId: id }).where(eq(documents.id, documentId));
  return id;
}
export function revisionService(db: Database = getDatabase()) {
  async function document(id: string, workspaceId: string) { return requireFound((await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId))))[0], "Document"); }
  return {
    async current(documentId: string, workspaceId: string) { const doc = await document(documentId, workspaceId); if (!doc.currentRevisionId) return null; return requireFound((await db.select().from(documentRevisions).where(and(eq(documentRevisions.id, doc.currentRevisionId), eq(documentRevisions.documentId, documentId))))[0], "Revision"); },
    async get(documentId: string, revisionId: string, workspaceId: string) { await document(documentId, workspaceId); return requireFound((await db.select().from(documentRevisions).where(and(eq(documentRevisions.id, revisionId), eq(documentRevisions.documentId, documentId))))[0], "Revision"); },
    async list(documentId: string, workspaceId: string) { await document(documentId, workspaceId); return db.select({ id: documentRevisions.id, documentId: documentRevisions.documentId, contentHash: documentRevisions.contentHash, createdAt: documentRevisions.createdAt }).from(documentRevisions).where(eq(documentRevisions.documentId, documentId)).orderBy(desc(documentRevisions.createdAt)); },
  };
}
