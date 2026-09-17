import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDatabase, type Database } from "../../db/client";
import { documentNodes, documents, documentRevisions, learningNodes, quotes, reviewRuns, reviewFindings, findingEvidence } from "../../db/schema";
import { getContentStorage } from "../storage/local";
import type { ContentStorage } from "../storage/content-storage";
import { documentService, serializeContent } from "../document/service";
import { contentHash } from "../document/hash";
import { resourceService } from "../resource/service";
import { createResourceFetcher, type ResourceFetcher } from "../resource/fetcher";
import { createReviewProvider } from "./provider";
import { createSearchProvider } from "./search";
import type { SearchProvider } from "./evidence";
import { type ReviewProvider, ReviewProviderError } from "./contracts";
import { factSourcePipeline } from "./pipeline";
import { mockReviewFetcher } from "./fixtures";
import { DomainError, requireFound } from "../../lib/errors";
import { quoteMarkdown } from "../../shared/quote";
import { reviewIsStale } from "../../shared/revision";
import { findingStatusInput, reviewStart } from "../../shared/review";
import type { z } from "zod";
let reviewQueue: Promise<unknown> = Promise.resolve();
export function reviewService({ db = getDatabase(), storage = getContentStorage(), provider: suppliedProvider, fetcher: suppliedFetcher, search: suppliedSearch }: { db?: Database; storage?: ContentStorage; provider?: ReviewProvider; fetcher?: ResourceFetcher; search?: SearchProvider } = {}) {
  const provider = () => suppliedProvider ?? createReviewProvider();
  async function document(id: string, workspaceId: string) { return requireFound((await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId))))[0], "Document"); }
  async function run(id: string, workspaceId: string) { const row = requireFound((await db.select().from(reviewRuns).where(eq(reviewRuns.id, id)))[0], "Review"); await document(row.documentId, workspaceId); return row; }
  async function execute(id: string) {
    const [job] = await db.update(reviewRuns).set({ status: "RUNNING", stage: "STARTING" }).where(and(eq(reviewRuns.id, id), eq(reviewRuns.status, "QUEUED"))).returning();
    if (!job) return;
    try {
      const revision = requireFound((await db.select().from(documentRevisions).where(eq(documentRevisions.id, job.revisionId)))[0], "Revision");
      const reviewer = provider();
      const result = await factSourcePipeline({ markdown: revision.contentSnapshot, type: job.type as "FACT_CHECK" | "SOURCE" | "FULL", groups: job.resourceSnapshot, quotes: job.quoteSnapshot }, { provider: reviewer, fetcher: suppliedFetcher ?? (reviewer.name === "mock" ? mockReviewFetcher : createResourceFetcher()), search: suppliedSearch ?? createSearchProvider(), stage: async (stage) => { await db.update(reviewRuns).set({ stage }).where(eq(reviewRuns.id, id)); } });
      await db.transaction(async (tx) => {
        for (const finding of result.findings) {
          const findingId = randomUUID(); const { evidence, ...fields } = finding;
          await tx.insert(reviewFindings).values({ id: findingId, reviewRunId: id, ...fields });
          for (const item of evidence) await tx.insert(findingEvidence).values({ id: randomUUID(), findingId, url: item.url, title: item.title, excerpt: item.text.slice(0, 1500) || null, sourceType: item.sourceType, accessedAt: new Date(item.accessedAt) });
        }
        await tx.update(reviewRuns).set({ status: "COMPLETED", stage: "COMPLETED", sourceChecks: result.sourceChecks, notices: result.notices, completedAt: new Date() }).where(eq(reviewRuns.id, id));
      });
    } catch (error) {
      await db.update(reviewRuns).set({ status: "FAILED", stage: "FAILED", error: error instanceof ReviewProviderError ? error.message : "レビューが失敗しました。接続設定・Documentの長さ（主張20件以内）を確認して再実行してください。", completedAt: new Date() }).where(eq(reviewRuns.id, id));
    }
  }
  return {
    execute,
    async setFindingStatus(id: string, workspaceId: string, input: z.infer<typeof findingStatusInput>) {
      const data = findingStatusInput.parse(input);
      const finding = requireFound((await db.select().from(reviewFindings).where(eq(reviewFindings.id, id)))[0], "Finding");
      await run(finding.reviewRunId, workspaceId);
      return (await db.update(reviewFindings).set(data).where(eq(reviewFindings.id, id)).returning())[0];
    },
    async listWorkspace(workspaceId: string) {
      return db.select({ id: reviewRuns.id, documentId: reviewRuns.documentId, documentTitle: documents.title, revisionId: reviewRuns.revisionId, status: reviewRuns.status, type: reviewRuns.type, provider: reviewRuns.provider, createdAt: reviewRuns.createdAt }).from(reviewRuns).innerJoin(documents, eq(reviewRuns.documentId, documents.id)).where(eq(documents.workspaceId, workspaceId)).orderBy(desc(reviewRuns.createdAt));
    },
    async recoverInterrupted() { await db.update(reviewRuns).set({ status: "FAILED", stage: "INTERRUPTED", error: "アプリの停止により中断しました。再実行してください。", completedAt: new Date() }).where(inArray(reviewRuns.status, ["QUEUED", "RUNNING"])); },
    async start(documentId: string, workspaceId: string, input: z.infer<typeof reviewStart>, autoStart = true) {
      const data = reviewStart.parse(input);
      if (["LOGIC", "COVERAGE"].includes(data.type)) throw new DomainError("Logic / Coverageは次の実装で利用できます。");
      const reviewer = provider();
      await documentService(db, storage).recover();
      const job = await serializeContent(async () => {
        const doc = await document(documentId, workspaceId);
        if (doc.currentRevisionId !== data.revisionId) throw new DomainError("現在の内容を保存してからReviewしてください。", 409);
        const revision = requireFound((await db.select().from(documentRevisions).where(and(eq(documentRevisions.id, data.revisionId), eq(documentRevisions.documentId, documentId))))[0], "Revision");
        if (contentHash(await storage.read(doc.path)) !== revision.contentHash) throw new DomainError("Markdownが外部で変更されています。保存してからReviewしてください。", 409);
        if (revision.contentSnapshot.length > 60000) throw new DomainError("Reviewは60,000文字以内に対応しています。");
        const links = await db.select().from(documentNodes).where(eq(documentNodes.documentId, documentId));
        const nodes = links.length ? await db.select().from(learningNodes).where(inArray(learningNodes.id, links.map((link) => link.nodeId))) : [];
        const rs = resourceService(db); const groups = [await rs.list(workspaceId, { kind: "document", id: documentId }), (await Promise.all(nodes.map((node) => rs.list(workspaceId, { kind: "node", id: node.id })))).flat(), await rs.list(workspaceId)];
        const quoteSnapshot = (await db.select().from(quotes).where(eq(quotes.documentId, documentId))).filter((q) => revision.contentSnapshot.includes(quoteMarkdown(q.text, q.sourceUrl, q.sourceTitle ?? undefined).trim())).map(({ id, text, sourceUrl, sourceTitle }) => ({ id, text, sourceUrl, sourceTitle }));
        const [job] = await db.insert(reviewRuns).values({ id: randomUUID(), documentId, revisionId: data.revisionId, type: data.type, provider: reviewer.name, objectives: nodes.flatMap((node) => node.learningObjectives.map((text, index) => ({ id: `${node.id}:${index}`, text }))), quoteSnapshot, resourceSnapshot: groups.map((group) => group.map(({ id, url, title, type }) => ({ id, url, title, type }))) }).returning();
        return job;
      });
      if (autoStart) { reviewQueue = reviewQueue.then(() => execute(job.id)).catch(() => {}); }
      return job;
    },
    async list(documentId: string, workspaceId: string) { await document(documentId, workspaceId); return db.select({ id: reviewRuns.id, revisionId: reviewRuns.revisionId, status: reviewRuns.status, type: reviewRuns.type, createdAt: reviewRuns.createdAt, provider: reviewRuns.provider }).from(reviewRuns).where(eq(reviewRuns.documentId, documentId)).orderBy(desc(reviewRuns.createdAt)); },
    async get(id: string, workspaceId: string) {
      const job = await run(id, workspaceId); const current = await documentService(db, storage).get(job.documentId, workspaceId);
      const revision = requireFound((await db.select().from(documentRevisions).where(eq(documentRevisions.id, job.revisionId)))[0], "Revision");
      const findings = await db.select().from(reviewFindings).where(eq(reviewFindings.reviewRunId, id));
      const evidence = findings.length ? await db.select().from(findingEvidence).where(inArray(findingEvidence.findingId, findings.map((f) => f.id))) : [];
      return { run: job, revision, stale: reviewIsStale(job.revisionId, current.document.currentRevisionId, revision.contentHash, current.contentHash), findings: findings.map((finding) => ({ ...finding, evidence: evidence.filter((item) => item.findingId === finding.id) })) };
    },
  };
}
