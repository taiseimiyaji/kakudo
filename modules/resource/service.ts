import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase, type Database, type DatabaseTransaction } from "../../db/client";
import { resources, documentResources, nodeResources, learningNodes, roadmaps, documents, workspaces } from "../../db/schema";
import { requireFound } from "../../lib/errors";
import { resourceInput, type ResourceTarget } from "../../shared/resource";
export function resourceService(db: Database = getDatabase()) {
  async function target(tx: Database | DatabaseTransaction, workspaceId: string, scope?: ResourceTarget) {
    const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)); requireFound(workspace, "Workspace");
    if (scope?.kind === "document") requireFound((await tx.select().from(documents).where(and(eq(documents.id, scope.id), eq(documents.workspaceId, workspaceId))))[0], "Document");
    if (scope?.kind === "node") requireFound((await tx.select().from(learningNodes).innerJoin(roadmaps, eq(learningNodes.roadmapId, roadmaps.id)).where(and(eq(learningNodes.id, scope.id), eq(roadmaps.workspaceId, workspaceId))))[0], "Node");
  }
  async function attach(tx: DatabaseTransaction, id: string, scope?: ResourceTarget) {
    if (scope?.kind === "node") await tx.insert(nodeResources).values({ nodeId: scope.id, resourceId: id }).onConflictDoNothing();
    if (scope?.kind === "document") await tx.insert(documentResources).values({ documentId: scope.id, resourceId: id }).onConflictDoNothing();
  }
  return {
    async list(workspaceId: string, scope?: ResourceTarget) {
      await target(db, workspaceId, scope);
      if (scope?.kind === "node") return (await db.select({ resource: resources }).from(resources).innerJoin(nodeResources, eq(nodeResources.resourceId, resources.id)).where(and(eq(resources.workspaceId, workspaceId), eq(nodeResources.nodeId, scope.id)))).map((r) => r.resource);
      if (scope?.kind === "document") return (await db.select({ resource: resources }).from(resources).innerJoin(documentResources, eq(documentResources.resourceId, resources.id)).where(and(eq(resources.workspaceId, workspaceId), eq(documentResources.documentId, scope.id)))).map((r) => r.resource);
      return db.select().from(resources).where(eq(resources.workspaceId, workspaceId));
    },
    async remove(id: string, workspaceId: string) { await db.delete(resources).where(and(eq(resources.id, id), eq(resources.workspaceId, workspaceId))); },
    async get(id: string, workspaceId: string) { return requireFound((await db.select().from(resources).where(and(eq(resources.id, id), eq(resources.workspaceId, workspaceId))))[0], "Resource"); },
    async create(workspaceId: string, input: z.infer<typeof resourceInput>, scope?: ResourceTarget) {
      const data = resourceInput.parse(input);
      return db.transaction(async (tx) => {
        await target(tx, workspaceId, scope);
        await tx.insert(resources).values({ id: randomUUID(), workspaceId, ...data }).onConflictDoNothing();
        const [resource] = await tx.select().from(resources).where(and(eq(resources.workspaceId, workspaceId), eq(resources.url, data.url)));
        await attach(tx, resource.id, scope); return resource;
      });
    },
    async link(workspaceId: string, id: string, scope: ResourceTarget) {
      return db.transaction(async (tx) => {
        await target(tx, workspaceId, scope);
        const resource = requireFound((await tx.select().from(resources).where(and(eq(resources.id, id), eq(resources.workspaceId, workspaceId))))[0], "Resource");
        await attach(tx, id, scope); return resource;
      });
    },
    async unlink(workspaceId: string, id: string, scope: ResourceTarget) {
      await target(db, workspaceId, scope);
      if (scope.kind === "node") await db.delete(nodeResources).where(and(eq(nodeResources.nodeId, scope.id), eq(nodeResources.resourceId, id)));
      else await db.delete(documentResources).where(and(eq(documentResources.documentId, scope.id), eq(documentResources.resourceId, id)));
    },
  };
}
