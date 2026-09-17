import { z } from "zod";
import { sourceUrlSchema } from "./quote";
export const resourceTypes = ["WEB", "OFFICIAL_DOC", "RFC", "PAPER", "OTHER"] as const;
export const resourceInput = z.object({ url: sourceUrlSchema, title: z.string().trim().max(500).default(""), type: z.enum(resourceTypes).default("WEB") }).strict();
export const resourceLinkInput = z.object({ resourceId: z.string().min(1).max(200) }).strict();
export type Resource = { id: string; workspaceId: string; url: string; title: string; type: typeof resourceTypes[number]; createdAt: string };
export type ResourceTarget = { kind: "node" | "document"; id: string };
