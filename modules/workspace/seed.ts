import type { Database } from "../../db/client";
import { workspaces } from "../../db/schema";

export const DEFAULT_WORKSPACE = { id: "default", name: "My Knowledge Workspace" } as const;

export async function seedWorkspace(db: Database): Promise<void> {
  // Idempotent and non-destructive: preserve user edits on repeated setup.
  await db.insert(workspaces).values(DEFAULT_WORKSPACE).onConflictDoNothing();
}
