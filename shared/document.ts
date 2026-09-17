import { z } from "zod";
export const documentCreate = z.object({ title: z.string().trim().min(1).max(200), nodeIds: z.array(z.string().min(1)).max(100).default([]), content: z.string().max(2_000_000).default("") }).strict();
export const documentSave = z.object({ title: z.string().trim().min(1).max(200), content: z.string().max(2_000_000), baseHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const documentSchema = z.object({ id: z.string(), workspaceId: z.string(), title: z.string(), path: z.string(), currentRevisionId: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
export const documentDetailSchema = z.object({ document: documentSchema, content: z.string(), contentHash: z.string(), nodeIds: z.array(z.string()) });
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
export type DocumentMetadata = z.infer<typeof documentSchema>;
