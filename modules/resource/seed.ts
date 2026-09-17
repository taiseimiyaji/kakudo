import { eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import { learningNodes, nodeResources, resources } from "../../db/schema";
export async function seedResources(db: Database, workspaceId = "default") {
  await db.transaction(async (tx) => {
    for (const number of [6749, 7636]) {
      const id = `${workspaceId}:rfc:${number}`;
      const created = await tx.insert(resources).values({ id, workspaceId, url: `https://www.rfc-editor.org/rfc/rfc${number}`, title: `RFC ${number}`, type: "RFC" }).onConflictDoNothing().returning();
      if (!created.length) continue;
      const nodeId = `${workspaceId}:backend-engineering:node:4`;
      if ((await tx.select().from(learningNodes).where(eq(learningNodes.id, nodeId))).length) await tx.insert(nodeResources).values({ nodeId, resourceId: id }).onConflictDoNothing();
    }
  });
}
