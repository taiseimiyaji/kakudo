import { appendRevision } from "../revision/service";
import { contentHash } from "./hash";
export { contentHash } from "./hash";
import { quoteInput, quoteMarkdown } from "../../shared/quote";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase, type DatabaseTransaction, type Database } from "../../db/client";
import { quotes, documents, documentNodes, documentWriteIntents, learningNodes, roadmaps, workspaces } from "../../db/schema";
import { documentCreate, documentSave } from "../../shared/document";
import type { ContentStorage } from "../storage/content-storage";
import { getContentStorage } from "../storage/local";
import { DomainError, requireFound } from "../../lib/errors";

// One local filesystem writer per application process. Multi-replica writes are outside this PoC.
let queue: Promise<unknown> = Promise.resolve();
export function serializeContent<T>(work: () => Promise<T>): Promise<T> { const result = queue.then(work); queue = result.catch(() => {}); return result; }

export function documentService(db: Database = getDatabase(), storage: ContentStorage = getContentStorage()) {
  async function row(id: string, workspaceId: string) {
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId)));
    return requireFound(doc, "Document");
  }
  async function recover() {
    for (const intent of await db.select().from(documentWriteIntents)) {
      const [current] = await db.select().from(documents).where(eq(documents.id, intent.documentId));
      const committed = intent.kind === "DELETE" ? !current : current?.lastWriteId === intent.id;
      const content = committed ? intent.after : intent.before;
      if (content === null) await storage.delete(intent.path); else await storage.write(intent.path, content);
      await db.delete(documentWriteIntents).where(eq(documentWriteIntents.id, intent.id));
    }
  }
  async function run<T>(work: () => Promise<T>) { return serializeContent(async () => { await recover(); return work(); }); }
  async function mutate(intent: typeof documentWriteIntents.$inferInsert, commit: (tx: DatabaseTransaction) => Promise<void>) {
    await db.insert(documentWriteIntents).values(intent);
    try {
      if (intent.after == null) await storage.delete(intent.path); else await storage.write(intent.path, intent.after);
      await db.transaction(commit);
    } catch (error) {
      try { await recover(); } catch { throw new DomainError("保存の回復が必要です。保存先へのアクセスを確認して再読み込みしてください。", 409); }
      throw error;
    }
    // If cleanup is interrupted, the durable journal identifies the committed write on the next access.
    await db.delete(documentWriteIntents).where(eq(documentWriteIntents.id, intent.id)).catch(() => {});
  }
  return {
    recover: () => run(async () => {}),
    list(workspaceId: string, nodeId?: string) { return run(async () => {
      if (nodeId) return (await db.select({ document: documents }).from(documents).innerJoin(documentNodes, eq(documentNodes.documentId, documents.id)).where(and(eq(documents.workspaceId, workspaceId), eq(documentNodes.nodeId, nodeId)))).map((r) => r.document);
      return db.select().from(documents).where(eq(documents.workspaceId, workspaceId)).orderBy(documents.updatedAt);
    }); },
    get(id: string, workspaceId: string) { return run(async () => {
      const doc = await row(id, workspaceId); const content = await storage.read(doc.path);
      const links = await db.select().from(documentNodes).where(eq(documentNodes.documentId, id));
      return { document: doc, content, contentHash: contentHash(content), nodeIds: links.map((r) => r.nodeId) };
    }); },
    create(workspaceId: string, input: z.infer<typeof documentCreate>) { return run(async () => {
      const data = documentCreate.parse(input);
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)); requireFound(workspace, "Workspace");
      const nodeIds = [...new Set(data.nodeIds)];
      if (nodeIds.length) {
        const nodes = await db.select({ id: learningNodes.id }).from(learningNodes).innerJoin(roadmaps, eq(learningNodes.roadmapId, roadmaps.id)).where(and(inArray(learningNodes.id, nodeIds), eq(roadmaps.workspaceId, workspaceId)));
        if (nodes.length !== nodeIds.length) throw new DomainError("Node not found in workspace", 404);
      }
      const id = randomUUID(); const path = `${workspaceId}/docs/${id}.md`; const operationId = randomUUID();
      await mutate({ id: operationId, documentId: id, path, kind: "CREATE", before: null, after: data.content }, async (tx) => {
        await tx.insert(documents).values({ id, workspaceId, path, title: data.title, lastWriteId: operationId });
        if (nodeIds.length) await tx.insert(documentNodes).values(nodeIds.map((nodeId) => ({ documentId: id, nodeId })));
        await appendRevision(tx, id, data.content);
      });
      return row(id, workspaceId);
    }); },
    save(id: string, workspaceId: string, input: z.infer<typeof documentSave>) { return run(async () => {
      const data = documentSave.parse(input); const doc = await row(id, workspaceId); const before = await storage.read(doc.path);
      if (contentHash(before) !== data.baseHash) throw new DomainError("Document changed. Reload before saving.", 409);
      const operationId = randomUUID();
      await mutate({ id: operationId, documentId: id, path: doc.path, kind: "UPDATE", before, after: data.content }, async (tx) => {
        await tx.update(documents).set({ title: data.title, updatedAt: new Date(), lastWriteId: operationId }).where(eq(documents.id, id));
        await appendRevision(tx, id, data.content);
      });
      return { document: await row(id, workspaceId), contentHash: contentHash(data.content) };
    }); },
    quote(id: string, workspaceId: string, input: z.infer<typeof quoteInput>) { return run(async () => {
      const data = quoteInput.parse(input); const doc = await row(id, workspaceId); const before = await storage.read(doc.path);
      if (contentHash(before) !== data.baseHash) throw new DomainError("Document changed. Reload before adding a quote.", 409);
      const quoted = quoteMarkdown(data.text, data.sourceUrl, data.sourceTitle);
      const after = data.content.slice(0, data.from) + quoted + data.content.slice(data.to);
      if (after.length > 2_000_000) throw new DomainError("Document is too large");
      const operationId = randomUUID(); const quoteId = randomUUID();
      await mutate({ id: operationId, documentId: id, path: doc.path, kind: "UPDATE", before, after }, async (tx) => {
        await tx.update(documents).set({ title: data.title, updatedAt: new Date(), lastWriteId: operationId }).where(eq(documents.id, id));
        await tx.insert(quotes).values({ id: quoteId, documentId: id, text: data.text, sourceUrl: data.sourceUrl, sourceTitle: data.sourceTitle });
        await appendRevision(tx, id, after);
      });
      return { quoteId, document: await row(id, workspaceId), content: after, contentHash: contentHash(after) };
    }); },
    remove(id: string, workspaceId: string) { return run(async () => {
      const doc = await row(id, workspaceId); const before = await storage.read(doc.path);
      await mutate({ id: randomUUID(), documentId: id, path: doc.path, kind: "DELETE", before, after: null }, async (tx) => { await tx.delete(documents).where(eq(documents.id, id)); });
    }); },
  };
}
