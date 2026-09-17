import { z } from "zod";

export const workspaceResponseSchema = z.object({
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string().datetime(),
  }),
});
