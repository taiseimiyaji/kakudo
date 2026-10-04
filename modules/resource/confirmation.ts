import type { z } from "zod";
import { resourceInput, resourceSchema, type Resource } from "../../shared/resource";

// Presence is evidence of the requested stored state, not proof that an absent
// request failed. An existing URL with different metadata stays uncertain.
export function confirmedResource(items: unknown, workspaceId: string, input: z.infer<typeof resourceInput>): Resource | null {
  if (!Array.isArray(items)) return null;
  const matches = items.filter((item) => item && typeof item === "object" && item.url === input.url);
  if (matches.length !== 1) return null;
  const result = resourceSchema.safeParse(matches[0]);
  if (!result.success) return null;
  const item = result.data;
  if (item.workspaceId !== workspaceId || item.title !== input.title || item.type !== input.type) return null;
  return item;
}
