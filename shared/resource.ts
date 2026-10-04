import { z } from "zod";
import { sourceUrlSchema } from "./quote";
export const resourceTypes = ["WEB", "OFFICIAL_DOC", "RFC", "PAPER", "OTHER"] as const;
export const resourceInput = z.object({ url: sourceUrlSchema, title: z.string().trim().max(500).default(""), type: z.enum(resourceTypes).default("WEB") }).strict();
export const resourceLinkInput = z.object({ resourceId: z.string().min(1).max(200) }).strict();
export const resourceSchema = z.object({ id: z.string().min(1), workspaceId: z.string().min(1), url: sourceUrlSchema, title: z.string(), type: z.enum(resourceTypes), createdAt: z.string() });
export type Resource = z.infer<typeof resourceSchema>;
export type ResourceTarget = { kind: "node" | "document"; id: string };
