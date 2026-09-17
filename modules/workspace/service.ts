import { eq } from "drizzle-orm";
import { getDatabase, type Database } from "../../db/client";
import { workspaces } from "../../db/schema";

export async function findWorkspace(id: string, db: Database = getDatabase()): Promise<typeof workspaces.$inferSelect | null> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  return workspace ?? null;
}
