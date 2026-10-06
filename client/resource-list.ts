import { z } from "zod";
import { resourceSchema, type Resource } from "../shared/resource";

const resourceListSchema = z.object({ resources: z.array(resourceSchema) });

export function readResourceList(payload: unknown, workspaceId: string): Resource[] {
  const { resources } = resourceListSchema.parse(payload);
  if (resources.some((resource) => resource.workspaceId !== workspaceId)) {
    throw new Error("資料の応答を確認できませんでした。");
  }
  // Rows encode IDs into URLs; malformed UTF-16 must fail before state changes.
  for (const resource of resources) encodeURIComponent(resource.id);
  return resources;
}
