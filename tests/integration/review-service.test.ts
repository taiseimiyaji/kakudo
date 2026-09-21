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
import { workspaces, reviewRuns } from "../../db/schema";
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
  await docs.save(doc.id, workspaceId, { title: "Edited during review", content: "My revised understanding.", baseHash: contentHash(content) });
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
  const quoted = await docs.quote(doc.id, workspaceId, { title: "Failure", text: "Unavailable quote", sourceUrl: "http://127.0.0.1/", content: "Claim.", baseHash: contentHash("Claim."), from: 6, to: 6 });
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
  await docs.save(doc.id, workspaceId, { title: "Status", content: "New explanation", baseHash: contentHash(content) });
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
