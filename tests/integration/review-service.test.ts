import { roadmapService } from "../../modules/roadmap/service";
import { createApp } from "../../server/app";
import { findWorkspace } from "../../modules/workspace/service";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../../db/client";
import { workspaces, reviewRuns, quotes } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { LocalFileSystemStorage } from "../../modules/storage/local";
import { documentService, contentHash } from "../../modules/document/service";
import { resourceService } from "../../modules/resource/service";
import { reviewService } from "../../modules/review/service";
import { mockProvider } from "../../modules/review/mock-provider";
import { mockReviewFetcher } from "../../modules/review/fixtures";
import type { Database } from "../../db/client";
const { db, client } = createDatabase(readTestDatabaseUrl()); const workspaceId = `reviews-${randomUUID()}`; let root: string; let storage: LocalFileSystemStorage;
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), "kakudo-reviews-")); storage = new LocalFileSystemStorage(root); await migrate(db, { migrationsFolder: "./db/migrations" }); await db.insert(workspaces).values({ id: workspaceId, name: "Reviews" }); });
afterAll(async () => { await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await client.end(); await rm(root, { recursive: true, force: true }); });
it("returns only stable admission codes for four refusals and keeps limits and content intact", async () => {
  const docs = documentService(db, storage); const maps = roadmapService(db);
  const app = createApp({ database: () => db, storage: () => storage, reviewProvider: mockProvider(), findWorkspace: (id) => findWorkspace(id, db), checkDatabase: async () => {} });
  const post = (id: string, revisionId: string) => app.request(`/api/documents/${id}/reviews?workspaceId=${workspaceId}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:43171" }, body: JSON.stringify({ revisionId, type: "LOGIC" }) });
  const rejected = async (doc: { id: string; currentRevisionId: string | null }, code: string, status: number, count = 0) => {
    const response = await post(doc.id, doc.currentRevisionId!);
    expect(response.status).toBe(status); expect(await response.json()).toEqual({ code });
    expect(await reviewService({ db, storage, provider: mockProvider() }).list(doc.id, workspaceId)).toHaveLength(count);
  };
  const tooLong = await docs.create(workspaceId, { title: "Too long", content: "x".repeat(60001), nodeIds: [] });
  await rejected(tooLong, "REVIEW_DOCUMENT_TOO_LONG", 400); expect(await storage.read(tooLong.path)).toHaveLength(60001);
  const boundary = await docs.create(workspaceId, { title: "Boundary", content: "x".repeat(60000), nodeIds: [] });
  const service = reviewService({ db, storage, provider: mockProvider() });
  const accepted = await service.start(boundary.id, workspaceId, { revisionId: boundary.currentRevisionId!, type: "LOGIC" }, false);
  await rejected(boundary, "REVIEW_ALREADY_RUNNING", 409, 1); await service.execute(accepted.id);
  const external = await docs.create(workspaceId, { title: "External", content: "Saved note.", nodeIds: [] });
  await storage.write(external.path, "External secret-value note.");
  await rejected(external, "REVIEW_EXTERNAL_CONTENT_CHANGED", 409); expect(await storage.read(external.path)).toBe("External secret-value note.");
  const map = await maps.create(workspaceId, { title: "Admission objectives", description: "" });
  const node = async (count: number) => maps.createNode(workspaceId, { roadmapId: map.id, title: `Goals ${count}`, description: "", positionX: 0, positionY: 0, status: "LEARNING", learningObjectives: Array.from({ length: count }, (_, i) => `Human objective ${i}`), guidingQuestions: [] });
  const a = await node(100); const b = await node(1);
  const goals = await docs.create(workspaceId, { title: "Goals", content: "Human note.", nodeIds: [a.id, b.id] });
  await rejected(goals, "REVIEW_OBJECTIVES_LIMIT", 400);
  const links = await docs.setNodes(goals.id, workspaceId, { nodeIds: [a.id], baseWriteId: goals.lastWriteId });
  const allowed = await service.start(goals.id, workspaceId, { revisionId: links.document.currentRevisionId!, type: "LOGIC" }, false); await service.execute(allowed.id);
  for (const doc of [tooLong, boundary, external, goals]) await docs.remove(doc.id, workspaceId);
  await maps.remove(map.id, workspaceId);
});
it("atomically rejects duplicate admission and bounds all pending reviews", async () => {
  const docs = documentService(db, storage);
  const doc = await docs.create(workspaceId, { title: "Admission", content: "My note.", nodeIds: [] });
  const service = reviewService({ db, storage, provider: mockProvider(), limits: { maxPending: 1, timeoutMs: 1000 } });
  const input = { revisionId: doc.currentRevisionId!, type: "LOGIC" as const };
  const attempts = await Promise.allSettled([service.start(doc.id, workspaceId, input, false), service.start(doc.id, workspaceId, input, false)]);
  expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(attempts.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
  await expect(service.start(doc.id, workspaceId, { ...input, type: "SOURCE" }, false)).rejects.toMatchObject({ status: 429 });
  const [job] = await service.list(doc.id, workspaceId); await service.execute(job.id);
  const next = await service.start(doc.id, workspaceId, input, false); await service.execute(next.id);
  expect((await service.get(next.id, workspaceId)).run.status).toBe("COMPLETED");
  await docs.remove(doc.id, workspaceId);
});

it("times out a stalled provider, advances the queue and ignores its late result", async () => {
  const docs = documentService(db, storage);
  const first = await docs.create(workspaceId, { title: "Slow", content: "Slow note.", nodeIds: [] });
  const second = await docs.create(workspaceId, { title: "Next", content: "Next note.", nodeIds: [] });
  let finish!: (value: []) => void;
  const stalled = new Promise<[]>((resolve) => { finish = resolve; });
  const provider = { ...mockProvider(), reviewLogic: vi.fn().mockImplementationOnce(() => stalled).mockResolvedValue([]) };
  // Include real DB latency: the healthy queued run must not share a 100ms CI deadline.
  const service = reviewService({ db, storage, provider, limits: { maxPending: 2, timeoutMs: 1000 } });
  const a = await service.start(first.id, workspaceId, { revisionId: first.currentRevisionId!, type: "LOGIC" });
  const b = await service.start(second.id, workspaceId, { revisionId: second.currentRevisionId!, type: "LOGIC" });
  await vi.waitFor(async () => expect((await service.get(b.id, workspaceId)).run.status).toBe("COMPLETED"), { timeout: 5000 });
  expect((await service.get(a.id, workspaceId)).run).toMatchObject({ status: "FAILED", error: expect.stringContaining("制限時間") });
  finish([]);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect((await service.get(a.id, workspaceId)).run.status).toBe("FAILED");
  expect(await storage.read(first.path)).toBe("Slow note.");
  await docs.remove(first.id, workspaceId); await docs.remove(second.id, workspaceId);
});

it("retries terminal-state persistence after a database outage", async () => {
  const docs = documentService(db, storage);
  const doc = await docs.create(workspaceId, { title: "Recovery", content: "Recovery note.", nodeIds: [] });
  let unavailable = false;
  const connection = new Proxy(db, { get(target, property) {
    if (property === "update" && unavailable) return () => { throw new Error("database unavailable with secret"); };
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } }) as Database;
  const service = reviewService({ db: connection, storage, provider: mockProvider() });
  const run = await service.start(doc.id, workspaceId, { revisionId: doc.currentRevisionId!, type: "LOGIC" }, false);
  unavailable = true; await service.execute(run.id);
  unavailable = false;
  await vi.waitFor(async () => expect((await service.get(run.id, workspaceId)).run.status).toBe("FAILED"), { timeout: 7000 });
  expect((await service.get(run.id, workspaceId)).run.error).not.toContain("secret");
  await docs.remove(doc.id, workspaceId);
});
it("pins revision/evidence snapshots through edits, persists findings and does not write content", async () => {
  const docs = documentService(db, storage); const content = "OAuthは認証プロトコルである。";
  const doc = await docs.create(workspaceId, { title: "Review note", content, nodeIds: [] });
  await resourceService(db).create(workspaceId, { url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC 6749", type: "RFC" }, { kind: "document", id: doc.id });
  const search = { search: vi.fn(async () => []) }; const service = reviewService({ db, storage, provider: mockProvider(), fetcher: mockReviewFetcher, search });
  const job = await service.start(doc.id, workspaceId, { revisionId: doc.currentRevisionId!, type: "FACT_CHECK" }, false); expect(job.status).toBe("QUEUED");
  await docs.save(doc.id, workspaceId, { title: "Edited during review", content: "My revised understanding.", baseHash: contentHash(content), baseWriteId: doc.lastWriteId });
  await service.execute(job.id); const result = await service.get(job.id, workspaceId);
  expect(result.run.status).toBe("COMPLETED"); expect(result.stale).toBe(true); expect(result.revision.contentSnapshot).toBe(content);
  expect(result.findings[0].verdict).toBe("CONTRADICTED"); expect(result.findings[0].evidence[0].url).toBe("https://www.rfc-editor.org/rfc/rfc6749"); expect(search.search).not.toHaveBeenCalled();
  expect(await storage.read(doc.path)).toBe("My revised understanding.");
  await expect(service.start(doc.id, workspaceId, { revisionId: doc.currentRevisionId!, type: "FACT_CHECK" })).rejects.toThrow("保存");
  await expect(service.get(job.id, "other")).rejects.toThrow("not found");
  const other = await docs.create(workspaceId, { title: "Other", content: "", nodeIds: [] });
  await expect(db.insert(reviewRuns).values({ id: randomUUID(), documentId: other.id, revisionId: doc.currentRevisionId!, type: "FULL", provider: "mock" })).rejects.toThrow();
  await docs.remove(other.id, workspaceId); await docs.remove(doc.id, workspaceId);
});
it("records failure and permits a new run, with source-unavailable distinct from incorrect", async () => {
  const docs = documentService(db, storage); const doc = await docs.create(workspaceId, { title: "Failure", content: "Claim.", nodeIds: [] });
  const service = reviewService({ db, storage, provider: { ...mockProvider(), async extractClaims() { throw new Error("private secret"); } }, search: { async search() { return []; } } });
  const failed = await service.start(doc.id, workspaceId, { revisionId: doc.currentRevisionId!, type: "FACT_CHECK" }, false); await service.execute(failed.id);
  const result = await service.get(failed.id, workspaceId); expect(result.run.status).toBe("FAILED"); expect(result.run.error).not.toContain("private secret"); expect(result.findings).toHaveLength(0);
  const quoted = await docs.quote(doc.id, workspaceId, { title: "Failure", text: "Unavailable quote", sourceUrl: "http://127.0.0.1/", content: "Claim.", baseHash: contentHash("Claim."), baseWriteId: doc.lastWriteId, from: 6, to: 6 });
  const next = await service.start(doc.id, workspaceId, { revisionId: quoted.document.currentRevisionId!, type: "SOURCE" }, false); await service.execute(next.id);
  expect((await service.get(next.id, workspaceId)).run.sourceChecks[0].status).toBe("UNAVAILABLE"); expect(await service.list(doc.id, workspaceId)).toHaveLength(2);
  await storage.write(doc.path, "external edit"); await expect(service.start(doc.id, workspaceId, { revisionId: quoted.document.currentRevisionId!, type: "SOURCE" })).rejects.toThrow("外部");
  await docs.remove(doc.id, workspaceId);
});

it("persists Resolve/Dismiss through scoped API and aggregates latest document reviews without duplicates", async () => {
  const maps = roadmapService(db); const map = await maps.create(workspaceId, { title: "Stats", description: "" });
  const node = await maps.createNode(workspaceId, { roadmapId: map.id, title: "OAuth", description: "", positionX: 0, positionY: 0, status: "LEARNING", learningObjectives: [], guidingQuestions: [] });
  const docs = documentService(db, storage); const content = "OAuthは認証プロトコルである。";
  const doc = await docs.create(workspaceId, { title: "Status", content, nodeIds: [node.id] });
  const rs = resourceService(db); const resource = await rs.create(workspaceId, { url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC", type: "RFC" }, { kind: "node", id: node.id }); await rs.link(workspaceId, resource.id, { kind: "document", id: doc.id });
  const service = reviewService({ db, storage, provider: mockProvider(), fetcher: mockReviewFetcher, search: { async search() { return []; } } });
  for (let i = 0; i < 2; i++) { const job = await service.start(doc.id, workspaceId, { type: "FACT_CHECK", revisionId: doc.currentRevisionId! }, false); await service.execute(job.id); }
  const [latest] = await service.list(doc.id, workspaceId); const { findings } = await service.get(latest.id, workspaceId);
  expect((await maps.detail(map.id, workspaceId)).nodes[0].stats).toEqual({ documents: 1, sources: 1, openFindings: 1, outdatedReviews: 0 });
  const app = createApp({ database: () => db, storage: () => storage, findWorkspace: (id) => findWorkspace(id, db), checkDatabase: async () => {} });
  const patch = (status: string, scope = workspaceId) => app.request(`/api/findings/${findings[0].id}?workspaceId=${scope}`, { method: "PATCH", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:43171" }, body: JSON.stringify({ status }) });
  expect((await patch("RESOLVED", "other")).status).toBe(404); expect((await patch("APPLIED")).status).toBe(400);
  for (const status of ["RESOLVED", "OPEN", "DISMISSED"]) { expect((await patch(status)).status).toBe(200); expect((await service.get(latest.id, workspaceId)).findings[0].status).toBe(status); }
  expect((await maps.detail(map.id, workspaceId)).nodes[0].stats.openFindings).toBe(0); expect(await storage.read(doc.path)).toBe(content);
  await docs.save(doc.id, workspaceId, { title: "Status", content: "New explanation", baseHash: contentHash(content), baseWriteId: doc.lastWriteId });
  expect((await maps.detail(map.id, workspaceId)).nodes[0].stats.outdatedReviews).toBe(1);
  expect(await service.listWorkspace("other")).toHaveLength(0);
  await docs.remove(doc.id, workspaceId); await maps.remove(map.id, workspaceId);
});

it("reviews logic, coverage and FULL on fixed human objectives across multiple nodes", async () => {
  const maps = roadmapService(db); const map = await maps.create(workspaceId, { title: "Learning review", description: "" });
  const objectiveTexts = ["OAuthとAuthenticationの違いを説明できる", "Authorization Code Flowを説明できる", "Access Tokenの役割を説明できる", "PKCEの目的を説明できる"];
  const node = await maps.createNode(workspaceId, { roadmapId: map.id, title: "OAuth", description: "", positionX: 0, positionY: 0, status: "LEARNING", learningObjectives: objectiveTexts, guidingQuestions: [] });
  const other = await maps.createNode(workspaceId, { roadmapId: map.id, title: "HTTP", description: "", positionX: 0, positionY: 220, status: "LEARNING", learningObjectives: ["HTTPの役割を説明できる"], guidingQuestions: [] });
  const docs = documentService(db, storage); const content = "OAuthは認証プロトコルである。\n\nCookieを使うのでSession認証は安全である。";
  const doc = await docs.create(workspaceId, { title: "Learning review", content, nodeIds: [node.id, other.id] });
  const service = reviewService({ db, storage, provider: mockProvider(), fetcher: mockReviewFetcher, search: { async search() { return []; } } });
  let fullId = "";
  for (const type of ["LOGIC", "COVERAGE", "FULL"] as const) {
    const job = await service.start(doc.id, workspaceId, { type, revisionId: doc.currentRevisionId! }, false); await service.execute(job.id);
    const result = await service.get(job.id, workspaceId); expect(result.run.status).toBe("COMPLETED"); expect(result.revision.id).toBe(doc.currentRevisionId);
    expect(result.run.objectives).toHaveLength(5);
    if (type !== "COVERAGE") expect(result.findings.some((f) => f.category === "LOGIC")).toBe(true);
    if (type !== "LOGIC") { expect(result.run.coverage).toHaveLength(5); expect(result.run.coverage.find((c) => c.objectiveId === `${node.id}:3`)?.status).toBe("NOT_COVERED"); }
    if (type === "FULL") fullId = job.id;
  }
  expect(await storage.read(doc.path)).toBe(content);
  await maps.updateNode(node.id, workspaceId, { learningObjectives: ["Updated human goal"] });
  const past = await service.get(fullId, workspaceId); expect(past.objectivesChanged).toBe(true); expect(past.stale).toBe(true); expect(past.run.objectives.map((o) => o.text)).toContain(objectiveTexts[3]);
  expect((await maps.detail(map.id, workspaceId)).nodes.find((n) => n.id === node.id)?.stats.outdatedReviews).toBe(1);
  const next = await service.start(doc.id, workspaceId, { type: "COVERAGE", revisionId: doc.currentRevisionId! }, false); await service.execute(next.id); expect((await service.get(next.id, workspaceId)).run.objectives).toHaveLength(2);
  await docs.remove(doc.id, workspaceId); await maps.remove(map.id, workspaceId);
});

it("persists explicit source finding IDs and displays only pinned quotes while leaving legacy runs untouched", async () => {
  const docs = documentService(db, storage); const doc = await docs.create(workspaceId, { title: "Pinned source quotes", content: "Human note.", nodeIds: [] });
  const texts = ["Different quote A", "Different quote B", "Different quote A"];
  for (const text of texts) {
    const current = await docs.get(doc.id, workspaceId);
    await docs.quote(doc.id, workspaceId, { title: doc.title, text, sourceUrl: "https://www.rfc-editor.org/rfc/rfc6749", sourceTitle: "Same source", content: current.content, baseHash: current.contentHash, baseWriteId: current.document.lastWriteId, from: current.content.length, to: current.content.length });
  }
  const baseline = await docs.get(doc.id, workspaceId);
  const service = reviewService({ db, storage, provider: mockProvider() });
  const job = await service.start(doc.id, workspaceId, { revisionId: baseline.document.currentRevisionId!, type: "SOURCE" }, false);
  // Both live metadata and current body change after admission. The run must use
  // its frozen registration, not either later source.
  await db.update(quotes).set({ text: "Later registration text" }).where(eq(quotes.documentId, doc.id));
  await docs.save(doc.id, workspaceId, { title: doc.title, content: "Later human note.", baseHash: baseline.contentHash, baseWriteId: baseline.document.lastWriteId });
  const saved = await docs.get(doc.id, workspaceId);
  await service.execute(job.id);
  const detail = await service.get(job.id, workspaceId);
  expect(detail.stale).toBe(true); expect(detail.revision.contentSnapshot).toBe(baseline.content);
  expect(detail.findings).toHaveLength(3);
  for (const check of detail.run.sourceChecks) {
    const quote = detail.run.quoteSnapshot.find((q) => q.id === check.quoteId)!;
    const finding = detail.findings.find((f) => f.id === check.findingId)!;
    expect(finding.sourceQuoteText).toBe(quote.text); expect(finding.targetText).toBeNull(); expect(finding.startOffset).toBeNull(); expect(finding.endOffset).toBeNull();
  }
  expect(detail.findings.map((f) => f.sourceQuoteText).sort()).toEqual([...texts].sort());
  // Simulate a real pre-feature row with snapshots but no association IDs.
  const oldChecks = detail.run.sourceChecks.map((check) => ({ quoteId: check.quoteId, status: check.status, url: check.url, title: check.title, accessedAt: check.accessedAt }));
  await db.update(reviewRuns).set({ sourceChecks: oldChecks }).where(eq(reviewRuns.id, job.id));
  const [before] = await db.select().from(reviewRuns).where(eq(reviewRuns.id, job.id));
  const legacy = await service.get(job.id, workspaceId);
  expect(legacy.findings.every((f) => f.sourceQuoteText === null)).toBe(true);
  expect((await db.select().from(reviewRuns).where(eq(reviewRuns.id, job.id)))[0]).toEqual(before);
  expect(await docs.get(doc.id, workspaceId)).toEqual(saved);
  await docs.remove(doc.id, workspaceId);
});
