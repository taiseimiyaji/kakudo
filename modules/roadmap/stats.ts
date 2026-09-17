import { objectivesChanged } from "../review/learning-review";
import { desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../db/client";
import { documentNodes, learningNodes, documents, documentResources, nodeResources, reviewRuns, reviewFindings } from "../../db/schema";
export async function nodeStats(db: Database, nodeIds: string[]) {
  const stats = new Map(nodeIds.map((id) => [id, { documents: 0, sources: 0, openFindings: 0, outdatedReviews: 0 }]));
  if (!nodeIds.length) return stats;
  const links = await db.select({ nodeId: documentNodes.nodeId, documentId: documentNodes.documentId, currentRevisionId: documents.currentRevisionId }).from(documentNodes).innerJoin(documents, eq(documentNodes.documentId, documents.id)).where(inArray(documentNodes.nodeId, nodeIds));
  const documentIds = [...new Set(links.map((link) => link.documentId))];
  const nodeSources = await db.select().from(nodeResources).where(inArray(nodeResources.nodeId, nodeIds));
  const docSources = documentIds.length ? await db.select().from(documentResources).where(inArray(documentResources.documentId, documentIds)) : [];
  const reviews = documentIds.length ? await db.select().from(reviewRuns).where(inArray(reviewRuns.documentId, documentIds)).orderBy(desc(reviewRuns.createdAt)) : [];
  const objectiveNodes = documentIds.length ? await db.select({ documentId: documentNodes.documentId, node: learningNodes }).from(documentNodes).innerJoin(learningNodes, eq(documentNodes.nodeId, learningNodes.id)).where(inArray(documentNodes.documentId, documentIds)) : [];
  const latest = new Map<string, typeof reviewRuns.$inferSelect>();
  for (const review of reviews) if (review.status === "COMPLETED" && !latest.has(review.documentId)) latest.set(review.documentId, review);
  const reviewIds = [...latest.values()].map((run) => run.id);
  const findings = reviewIds.length ? await db.select().from(reviewFindings).where(inArray(reviewFindings.reviewRunId, reviewIds)) : [];
  for (const id of nodeIds) {
    const linked = links.filter((link) => link.nodeId === id); const docs = new Set(linked.map((link) => link.documentId));
    const sources = new Set([...nodeSources.filter((s) => s.nodeId === id), ...docSources.filter((s) => docs.has(s.documentId))].map((s) => s.resourceId));
    const runs = linked.flatMap((link) => latest.get(link.documentId) ? [latest.get(link.documentId)!] : []);
    stats.set(id, { documents: docs.size, sources: sources.size, openFindings: findings.filter((f) => f.status === "OPEN" && runs.some((r) => r.id === f.reviewRunId)).length, outdatedReviews: linked.filter((link) => { const run = latest.get(link.documentId); return run && (run.revisionId !== link.currentRevisionId || ["COVERAGE", "FULL"].includes(run.type) && objectivesChanged(run.objectives, objectiveNodes.filter((item) => item.documentId === link.documentId).flatMap(({ node }) => node.learningObjectives.map((text, index) => ({ id: `${node.id}:${index}`, text }))))); }).length });
  }
  return stats;
}
