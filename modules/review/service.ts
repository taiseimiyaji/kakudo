import { learningReview, objectivesChanged } from "./learning-review";
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
import { type ReviewProvider, type CoverageResult, ReviewProviderError } from "./contracts";
import { factSourcePipeline } from "./pipeline";
import { mockReviewFetcher } from "./fixtures";
import { DomainError, requireFound } from "../../lib/errors";
import { quoteMarkdown } from "../../shared/quote";
import { reviewIsStale } from "../../shared/revision";
import { findingStatusInput, reviewStart } from "../../shared/review";
import type { z } from "zod";
import { abortable, boundedProvider, executionConfig } from "./execution";
import { errorKind, logEvent } from "../../lib/observability";
let reviewQueue: Promise<unknown> = Promise.resolve();
const pendingFailures = new Map<string, { db: Database; message: string }>();
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retrying = false;
async function persistFailure(id: string, failure: { db: Database; message: string }) {
  try {
    await failure.db.update(reviewRuns).set({ status: "FAILED", stage: "FAILED", error: failure.message, completedAt: new Date() }).where(and(eq(reviewRuns.id, id), inArray(reviewRuns.status, ["QUEUED", "RUNNING"])));
    pendingFailures.delete(id);
  } catch (error) { logEvent("review_failure_persist_failed", { reviewId: id, reason: errorKind(error) }); }
}
async function persistFailures() {
  if (retrying) return;
  retrying = true;
  try { await Promise.all([...pendingFailures].map(([id, failure]) => persistFailure(id, failure))); }
  finally { retrying = false; }
  if (pendingFailures.size && !retryTimer) {
    retryTimer = setTimeout(() => { retryTimer = undefined; void persistFailures(); }, 5000); retryTimer.unref();
  }
}
export function reviewService({ db = getDatabase(), storage = getContentStorage(), provider: suppliedProvider, fetcher: suppliedFetcher, search: suppliedSearch, limits }: { db?: Database; storage?: ContentStorage; provider?: ReviewProvider; fetcher?: ResourceFetcher; search?: SearchProvider; limits?: { maxPending: number; timeoutMs: number } } = {}) {
  const config = executionConfig.parse(process.env);
  const maxPending = limits?.maxPending ?? config.REVIEW_MAX_PENDING;
  const timeoutMs = limits?.timeoutMs ?? config.REVIEW_RUN_TIMEOUT_MS;
  const provider = (signal?: AbortSignal) => suppliedProvider ?? createReviewProvider(process.env, signal);
  async function document(id: string, workspaceId: string) { return requireFound((await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.workspaceId, workspaceId))))[0], "Document"); }
  async function run(id: string, workspaceId: string) { const row = requireFound((await db.select().from(reviewRuns).where(eq(reviewRuns.id, id)))[0], "Review"); await document(row.documentId, workspaceId); return row; }
  async function execute(id: string) {
    const controller = new AbortController(); const { signal } = controller;
    const timer = setTimeout(() => controller.abort(new Error("Review deadline exceeded")), timeoutMs);
    try {
      const [job] = await db.update(reviewRuns).set({ status: "RUNNING", stage: "STARTING" }).where(and(eq(reviewRuns.id, id), eq(reviewRuns.status, "QUEUED"))).returning();
      if (!job) return;
      signal.throwIfAborted();
      const revision = requireFound((await db.select().from(documentRevisions).where(eq(documentRevisions.id, job.revisionId)))[0], "Revision");
      const reviewer = boundedProvider(provider(signal), signal);
      const stage = async (stage: string) => { signal.throwIfAborted(); await db.update(reviewRuns).set({ stage }).where(and(eq(reviewRuns.id, id), eq(reviewRuns.status, "RUNNING"))); signal.throwIfAborted(); };
      const fetcher = suppliedFetcher ?? (reviewer.name === "mock" ? mockReviewFetcher : createResourceFetcher({ signal }));
      const search = suppliedSearch ?? createSearchProvider(process.env, signal);
      const result = ["FACT_CHECK", "SOURCE", "FULL"].includes(job.type) ? await abortable(signal, () => factSourcePipeline({ markdown: revision.contentSnapshot, type: job.type as "FACT_CHECK" | "SOURCE" | "FULL", groups: job.resourceSnapshot, quotes: job.quoteSnapshot }, { provider: reviewer, fetcher: { fetch: (url) => abortable(signal, () => fetcher.fetch(url)) }, search: { search: (query) => abortable(signal, () => search.search(query)) }, stage })) : { findings: [], notices: [], sourceChecks: [] };
      let coverage: CoverageResult[] = [];
      if (["LOGIC", "COVERAGE", "FULL"].includes(job.type)) {
        const learning = await abortable(signal, () => learningReview(revision.contentSnapshot, job.objectives, job.type as "LOGIC" | "COVERAGE" | "FULL", reviewer, stage));
        result.findings.push(...learning.findings); result.notices.push(...learning.notices); coverage = learning.coverage;
      }
      await db.transaction(async (tx) => {
        signal.throwIfAborted();
        for (const finding of result.findings) {
          signal.throwIfAborted();
          const findingId = randomUUID(); const { evidence, ...fields } = finding;
          await tx.insert(reviewFindings).values({ id: findingId, reviewRunId: id, ...fields });
          for (const item of evidence) await tx.insert(findingEvidence).values({ id: randomUUID(), findingId, url: item.url, title: item.title, excerpt: item.text.slice(0, 1500) || null, sourceType: item.sourceType, accessedAt: new Date(item.accessedAt) });
        }
        signal.throwIfAborted();
        await tx.update(reviewRuns).set({ status: "COMPLETED", stage: "COMPLETED", sourceChecks: result.sourceChecks, coverage, notices: result.notices, completedAt: new Date() }).where(and(eq(reviewRuns.id, id), eq(reviewRuns.status, "RUNNING")));
        signal.throwIfAborted();
      });
    } catch (error) {
      logEvent("review_failed", { reviewId: id, reason: signal.aborted ? "deadline" : error instanceof ReviewProviderError ? "provider" : errorKind(error) });
      const failure = { db, message: signal.aborted ? "レビュー全体の制限時間を超えました。資料やDocumentを絞って再実行してください。" : error instanceof ReviewProviderError ? error.message : "レビューが失敗しました。接続設定・Documentの長さ（主張20件以内）を確認して再実行してください。" };
      pendingFailures.set(id, failure);
      await persistFailure(id, failure);
      void persistFailures();
    } finally { clearTimeout(timer); controller.abort(); }
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
      const reviewer = provider();
      await documentService(db, storage).recover();
      const job = await serializeContent(async () => {
        void persistFailures();
        const doc = await document(documentId, workspaceId);
        const pending = await db.select({ documentId: reviewRuns.documentId, revisionId: reviewRuns.revisionId, type: reviewRuns.type }).from(reviewRuns).where(inArray(reviewRuns.status, ["QUEUED", "RUNNING"]));
        if (pending.some((run) => run.documentId === documentId && run.revisionId === data.revisionId && run.type === data.type)) throw new DomainError("同じRevision・種類のReviewが進行中です。完了を待ってください。", 409);
        if (pending.length >= maxPending) throw new DomainError("Reviewの受付上限です。進行中のReviewが完了してから再実行してください。", 429);
        if (doc.currentRevisionId !== data.revisionId) throw new DomainError("現在の内容を保存してからReviewしてください。", 409);
        const revision = requireFound((await db.select().from(documentRevisions).where(and(eq(documentRevisions.id, data.revisionId), eq(documentRevisions.documentId, documentId))))[0], "Revision");
        if (contentHash(await storage.read(doc.path)) !== revision.contentHash) throw new DomainError("Markdownが外部で変更されています。保存してからReviewしてください。", 409);
        if (revision.contentSnapshot.length > 60000) throw new DomainError("Reviewは60,000文字以内に対応しています。");
        const links = await db.select().from(documentNodes).where(eq(documentNodes.documentId, documentId));
        const nodes = links.length ? await db.select().from(learningNodes).where(inArray(learningNodes.id, links.map((link) => link.nodeId))) : [];
        if (nodes.reduce((total, node) => total + node.learningObjectives.length, 0) > 100) throw new DomainError("関連NodeのLearning Objectivesは合計100件以内にしてください。");
        const rs = resourceService(db); const groups = [await rs.list(workspaceId, { kind: "document", id: documentId }), (await Promise.all(nodes.map((node) => rs.list(workspaceId, { kind: "node", id: node.id })))).flat(), await rs.list(workspaceId)];
        const quoteSnapshot = (await db.select().from(quotes).where(eq(quotes.documentId, documentId))).filter((q) => revision.contentSnapshot.includes(quoteMarkdown(q.text, q.sourceUrl, q.sourceTitle ?? undefined).trim())).map(({ id, text, sourceUrl, sourceTitle }) => ({ id, text, sourceUrl, sourceTitle }));
        const [job] = await db.insert(reviewRuns).values({ id: randomUUID(), documentId, revisionId: data.revisionId, type: data.type, provider: reviewer.name, objectives: nodes.flatMap((node) => node.learningObjectives.map((text, index) => ({ id: `${node.id}:${index}`, text, nodeTitle: node.title }))), quoteSnapshot, resourceSnapshot: groups.map((group) => group.map(({ id, url, title, type }) => ({ id, url, title, type }))) }).returning();
        return job;
      });
      if (autoStart) { reviewQueue = reviewQueue.then(() => execute(job.id)).catch(() => { logEvent("review_queue_failed", { reviewId: job.id }); }); }
      return job;
    },
    async list(documentId: string, workspaceId: string) { await document(documentId, workspaceId); return db.select({ id: reviewRuns.id, revisionId: reviewRuns.revisionId, status: reviewRuns.status, type: reviewRuns.type, createdAt: reviewRuns.createdAt, provider: reviewRuns.provider }).from(reviewRuns).where(eq(reviewRuns.documentId, documentId)).orderBy(desc(reviewRuns.createdAt)); },
    async get(id: string, workspaceId: string) {
      const job = await run(id, workspaceId); const current = await documentService(db, storage).get(job.documentId, workspaceId);
      const revision = requireFound((await db.select().from(documentRevisions).where(eq(documentRevisions.id, job.revisionId)))[0], "Revision");
      const findings = await db.select().from(reviewFindings).where(eq(reviewFindings.reviewRunId, id));
      const evidence = findings.length ? await db.select().from(findingEvidence).where(inArray(findingEvidence.findingId, findings.map((f) => f.id))) : [];
      const currentNodes = current.nodeIds.length ? await db.select().from(learningNodes).where(inArray(learningNodes.id, current.nodeIds)) : [];
      const changedObjectives = ["COVERAGE", "FULL"].includes(job.type) && objectivesChanged(job.objectives, currentNodes.flatMap((node) => node.learningObjectives.map((text, index) => ({ id: `${node.id}:${index}`, text }))));
      return { run: job, revision, objectivesChanged: changedObjectives, stale: changedObjectives || reviewIsStale(job.revisionId, current.document.currentRevisionId, revision.contentHash, current.contentHash), findings: findings.map((finding) => ({ ...finding, evidence: evidence.filter((item) => item.findingId === finding.id) })) };
    },
  };
}
