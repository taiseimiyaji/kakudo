import { nodeStats } from "./stats";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getDatabase, type Database } from "../../db/client";
import { learningNodes, roadmapEdges, roadmaps, workspaces } from "../../db/schema";
import { edgeInput, nodeInput, nodePatch, roadmapInput, roadmapPatch } from "../../shared/roadmap";
import { DomainError, requireFound } from "../../lib/errors";

export function roadmapService(db: Database = getDatabase()) {
  async function roadmap(id: string, workspaceId: string) {
    const [row] = await db.select().from(roadmaps).where(and(eq(roadmaps.id, id), eq(roadmaps.workspaceId, workspaceId)));
    return requireFound(row, "Roadmap");
  }
  async function node(id: string, workspaceId: string) {
    const [row] = await db.select({ node: learningNodes }).from(learningNodes).innerJoin(roadmaps, eq(learningNodes.roadmapId, roadmaps.id)).where(and(eq(learningNodes.id, id), eq(roadmaps.workspaceId, workspaceId)));
    return requireFound(row?.node, "Node");
  }
  return {
    async list(workspaceId: string) { return db.select().from(roadmaps).where(eq(roadmaps.workspaceId, workspaceId)).orderBy(roadmaps.createdAt); },
    async detail(id: string, workspaceId: string) {
      const row = await roadmap(id, workspaceId);
      const [nodes, edges] = await Promise.all([db.select().from(learningNodes).where(eq(learningNodes.roadmapId, id)), db.select().from(roadmapEdges).where(eq(roadmapEdges.roadmapId, id))]);
      const stats = await nodeStats(db, nodes.map((node) => node.id));
      return { roadmap: row, nodes: nodes.map((node) => ({ ...node, stats: stats.get(node.id)! })), edges };
    },
    async create(workspaceId: string, input: z.infer<typeof roadmapInput>) {
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
      requireFound(workspace, "Workspace");
      const [row] = await db.insert(roadmaps).values({ id: randomUUID(), workspaceId, ...roadmapInput.parse(input) }).returning();
      return row;
    },
    async update(id: string, workspaceId: string, input: z.infer<typeof roadmapPatch>) {
      await roadmap(id, workspaceId);
      const [row] = await db.update(roadmaps).set(roadmapPatch.parse(input)).where(eq(roadmaps.id, id)).returning(); return row;
    },
    async remove(id: string, workspaceId: string) { await roadmap(id, workspaceId); await db.delete(roadmaps).where(eq(roadmaps.id, id)); },
    async createNode(workspaceId: string, input: z.infer<typeof nodeInput>) {
      const data = nodeInput.parse(input); await roadmap(data.roadmapId, workspaceId);
      const [row] = await db.insert(learningNodes).values({ id: randomUUID(), ...data }).returning(); return row;
    },
    async updateNode(id: string, workspaceId: string, input: z.infer<typeof nodePatch>) {
      await node(id, workspaceId);
      const [row] = await db.update(learningNodes).set(nodePatch.parse(input)).where(eq(learningNodes.id, id)).returning(); return row;
    },
    async removeNode(id: string, workspaceId: string) { await node(id, workspaceId); await db.delete(learningNodes).where(eq(learningNodes.id, id)); },
    async createEdge(workspaceId: string, input: z.infer<typeof edgeInput>) {
      const data = edgeInput.parse(input); await roadmap(data.roadmapId, workspaceId);
      const [source, target] = await Promise.all([node(data.sourceId, workspaceId), node(data.targetId, workspaceId)]);
      if (source.roadmapId !== data.roadmapId || target.roadmapId !== data.roadmapId) throw new DomainError("Nodes must belong to the same roadmap");
      const [row] = await db.insert(roadmapEdges).values({ id: randomUUID(), ...data }).onConflictDoNothing().returning();
      if (!row) throw new DomainError("Connection already exists", 409); return row;
    },
    async removeEdge(id: string, workspaceId: string) {
      const [row] = await db.select({ edge: roadmapEdges }).from(roadmapEdges).innerJoin(roadmaps, eq(roadmapEdges.roadmapId, roadmaps.id)).where(and(eq(roadmapEdges.id, id), eq(roadmaps.workspaceId, workspaceId)));
      requireFound(row, "Edge"); await db.delete(roadmapEdges).where(eq(roadmapEdges.id, id));
    },
  };
}
