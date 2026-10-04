import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { expect, it } from "vitest";
import { createDatabase } from "../../db/client";
import { workspaces, quotes } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { documentService } from "../../modules/document/service";
import { revisionService } from "../../modules/revision/service";
import { reviewService } from "../../modules/review/service";
import { mockReviewFetcher } from "../../modules/review/fixtures";
import { mockProvider } from "../../modules/review/mock-provider";
import { LocalFileSystemStorage } from "../../modules/storage/local";

it.each(["\n", "\r\n"])("keeps past quote snapshots and excludes an undone quote after saving (%j)", async (separator) => {
  const { db, client } = createDatabase(readTestDatabaseUrl());
  const workspaceId = `quote-undo-${randomUUID()}`; const root = await mkdtemp(join(tmpdir(), "kakudo-quote-undo-"));
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    await db.insert(workspaces).values({ id: workspaceId, name: "Quote undo" });
    const storage = new LocalFileSystemStorage(root); const docs = documentService(db, storage);
    const content = `My words${separator}My explanation`;
    const doc = await docs.create(workspaceId, { title: "Note", content, nodeIds: [] });
    const original = await docs.get(doc.id, workspaceId);
    const quoted = await docs.quote(doc.id, workspaceId, { title: "Note", content, baseHash: original.contentHash, baseWriteId: original.document.lastWriteId, text: "Reference", sourceUrl: "https://example.com/", from: content.length, to: content.length });
    if (separator === "\r\n") expect(quoted.content.replaceAll("\r\n", "")).not.toContain("\n");
    const reviews = reviewService({ db, storage, provider: mockProvider(), fetcher: mockReviewFetcher });
    const previous = await reviews.start(doc.id, workspaceId, { type: "SOURCE", revisionId: quoted.document.currentRevisionId! }, false);
    await reviews.execute(previous.id);
    expect((await reviews.get(previous.id, workspaceId)).run.quoteSnapshot).toHaveLength(1);
    const saved = await docs.save(doc.id, workspaceId, { title: "Note", content, baseHash: quoted.contentHash, baseWriteId: quoted.document.lastWriteId });
    expect((await docs.get(doc.id, workspaceId)).content).toBe(content);
    expect(await revisionService(db).list(doc.id, workspaceId)).toHaveLength(3);
    const next = await reviews.start(doc.id, workspaceId, { type: "SOURCE", revisionId: saved.document.currentRevisionId! }, false);
    await reviews.execute(next.id);
    const current = await reviews.get(next.id, workspaceId);
    expect(current.revision.contentSnapshot).toBe(content); expect(current.run.sourceChecks).toEqual([]); expect(current.run.quoteSnapshot).toEqual([]);
    expect((await reviews.get(previous.id, workspaceId)).stale).toBe(true);
    expect((await reviews.get(previous.id, workspaceId)).run.quoteSnapshot).toHaveLength(1);
    expect(await db.select().from(quotes).where(eq(quotes.documentId, doc.id))).toHaveLength(1);
  } finally {
    await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await client.end(); await rm(root, { recursive: true, force: true });
  }
});
