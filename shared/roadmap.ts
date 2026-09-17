import { z } from "zod";

export const nodeStatuses = ["NOT_STARTED", "LEARNING", "REVIEWING", "LEARNED"] as const;
export const edgeTypes = ["PREREQUISITE", "PARENT", "RELATED"] as const;
const title = z.string().trim().min(1).max(200);
const lines = z.array(z.string().trim().min(1).max(2000)).max(100);
export const roadmapInput = z.object({ title, description: z.string().max(10000).default("") }).strict();
export const roadmapPatch = roadmapInput.extend({ description: z.string().max(10000) }).partial().refine((v) => Object.keys(v).length > 0);
export const nodeFields = z.object({
  title, description: z.string().max(10000).default(""),
  positionX: z.number().finite().min(-100000).max(100000).default(0),
  positionY: z.number().finite().min(-100000).max(100000).default(0),
  status: z.enum(nodeStatuses).default("NOT_STARTED"),
  learningObjectives: lines.default([]), guidingQuestions: lines.default([]),
}).strict();
export const nodeInput = nodeFields.extend({ roadmapId: z.string().min(1) });
export const nodePatch = z.object({
  title, description: z.string().max(10000),
  positionX: z.number().finite().min(-100000).max(100000), positionY: z.number().finite().min(-100000).max(100000),
  status: z.enum(nodeStatuses), learningObjectives: lines, guidingQuestions: lines,
}).strict().partial().refine((v) => Object.keys(v).length > 0);
export const edgeInput = z.object({ roadmapId: z.string().min(1), sourceId: z.string().min(1), targetId: z.string().min(1), type: z.enum(edgeTypes) }).strict().refine((v) => v.sourceId !== v.targetId, { message: "Node cannot connect to itself" });
export const roadmapSchema = roadmapInput.extend({ id: z.string(), workspaceId: z.string(), createdAt: z.string() });
export const learningNodeSchema = nodeFields.extend({ id: z.string(), roadmapId: z.string() });
export const edgeSchema = z.object({ id: z.string(), roadmapId: z.string(), sourceId: z.string(), targetId: z.string(), type: z.enum(edgeTypes) });
export const roadmapDetailSchema = z.object({ roadmap: roadmapSchema, nodes: z.array(learningNodeSchema), edges: z.array(edgeSchema) });
export type Roadmap = z.infer<typeof roadmapSchema>;
export type LearningNode = z.infer<typeof learningNodeSchema>;
export type RoadmapEdge = z.infer<typeof edgeSchema>;
export type RoadmapDetail = z.infer<typeof roadmapDetailSchema>;
