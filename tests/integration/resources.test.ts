import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDatabase } from "../../db/client";
import { workspaces, roadmaps, learningNodes, documents, resources, nodeResources } from "../../db/schema";
import { readTestDatabaseUrl } from "../../lib/env";
import { resourceService } from "../../modules/resource/service";
import { seedResources } from "../../modules/resource/seed";
import { createApp } from "../../server/app";
import { findWorkspace } from "../../modules/workspace/service";
const { db, client } = createDatabase(readTestDatabaseUrl()); const workspaceId = `resources-${randomUUID()}`; const foreignId = `${workspaceId}-other`; const nodeId = `${workspaceId}:backend-engineering:node:4`; const documentId = randomUUID();
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await db.insert(workspaces).values([{ id: workspaceId, name: "Resources" }, { id: foreignId, name: "Other" }]);
  await db.insert(roadmaps).values({ id: workspaceId, workspaceId, title: "Map" });
  await db.insert(learningNodes).values({ id: nodeId, roadmapId: workspaceId, title: "OAuth" });
  await db.insert(documents).values({ id: documentId, workspaceId, title: "Note", path: `${workspaceId}/docs/test.md` });
});
afterAll(async () => { await db.delete(workspaces).where(eq(workspaces.id, workspaceId)); await db.delete(workspaces).where(eq(workspaces.id, foreignId)); await client.end(); });
it("scopes resources and links, deduplicates URLs, preserves resources after unlink and cascades deletes", async () => {
  const service = resourceService(db); const node = { kind: "node" as const, id: nodeId }; const document = { kind: "document" as const, id: documentId };
  const item = await service.create(workspaceId, { url: "https://example.com/source", title: "Source", type: "OFFICIAL_DOC" }, node);
  expect((await service.create(workspaceId, { url: item.url, title: "Ignored duplicate", type: "WEB" })).id).toBe(item.id);
  await service.link(workspaceId, item.id, document); await service.link(workspaceId, item.id, document);
  expect(await service.list(workspaceId, document)).toHaveLength(1); expect(await service.list(workspaceId, node)).toHaveLength(1);
  await expect(service.link(foreignId, item.id, document)).rejects.toThrow("not found");
  await expect(service.create(foreignId, { url: item.url, title: "Wrong", type: "WEB" }, node)).rejects.toThrow("not found");
  await expect(db.insert(nodeResources).values({ nodeId: "missing", resourceId: item.id })).rejects.toThrow();
  await service.unlink(workspaceId, item.id, node); expect(await service.list(workspaceId, node)).toHaveLength(0); expect(await service.get(item.id, workspaceId)).toBeDefined();
  await service.remove(item.id, workspaceId); expect(await service.list(workspaceId, document)).toHaveLength(0);
});
it("seeds references idempotently without restoring removed associations", async () => {
  await seedResources(db, workspaceId); await seedResources(db, workspaceId);
  expect(await db.select().from(resources).where(eq(resources.workspaceId, workspaceId))).toHaveLength(2);
  await db.delete(nodeResources).where(eq(nodeResources.nodeId, nodeId)); await seedResources(db, workspaceId);
  expect(await db.select().from(nodeResources).where(eq(nodeResources.nodeId, nodeId))).toHaveLength(0);
});
it("registers without network access but safe fetch API returns UNAVAILABLE for private URLs", async () => {
  const app = createApp({ database: () => db, findWorkspace: (id) => findWorkspace(id, db), checkDatabase: async () => {} });
  const registered = await app.request(`/api/documents/${documentId}/resources?workspaceId=${workspaceId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "http://127.0.0.1/" }) });
  expect(registered.status).toBe(201); const { resource } = await registered.json();
  const fetched = await app.request(`/api/resources/${resource.id}/fetch?workspaceId=${workspaceId}`, { method: "POST" }); expect(fetched.status).toBe(422); expect((await fetched.json()).status).toBe("UNAVAILABLE");
});
