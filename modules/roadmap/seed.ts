import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { roadmaps, learningNodes, roadmapEdges } from "../../db/schema";

export async function seedRoadmap(db: Database, workspaceId = "default") {
  const roadmapId = `${workspaceId}:backend-engineering`;
  // Only seed a newly created map; never restore nodes the learner deleted.
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(roadmaps).values({ id: roadmapId, workspaceId, title: "Backend Engineering" }).onConflictDoNothing().returning();
    if (!inserted.length) return;
    const titles = ["HTTP", "Authentication", "Session", "Cookie", "OAuth", "Authorization Code", "PKCE", "Database"];
    const ids = titles.map((_, i) => `${roadmapId}:node:${i}`);
    await tx.insert(learningNodes).values(titles.map((title, i) => ({ id: ids[i], roadmapId, title, positionX: [40, 40, -230, 40, 310, 180, 450, 650][i], positionY: [0, 180, 360, 360, 360, 580, 580, 0][i], learningObjectives: title === "OAuth" ? ["OAuthとAuthenticationの違いを説明できる", "Authorization Code Flowを説明できる", "Access Tokenの役割を説明できる", "PKCEの目的を説明できる"] : [] })));
    for (const [source, target, type] of [[0, 1, "PREREQUISITE"], [1, 2, "PARENT"], [1, 3, "PARENT"], [1, 4, "PREREQUISITE"], [4, 5, "PARENT"], [4, 6, "PREREQUISITE"]] as const) {
      await tx.insert(roadmapEdges).values({ id: randomUUID(), roadmapId, sourceId: ids[source], targetId: ids[target], type });
    }
  });
  return (await db.select().from(roadmaps).where(eq(roadmaps.id, roadmapId)))[0];
}
