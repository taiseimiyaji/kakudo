import { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";
import { learningNodeSchema, nodePatch, roadmapPatch, roadmapSchema, roadmapDetailSchema, type LearningNode, type Roadmap } from "../shared/roadmap";

type Base = { workspaceId: string; mapId: string; name: string };
export type GraphSaveTarget = Base & ({ kind: "map"; input: z.infer<typeof roadmapPatch> } | { kind: "node"; nodeId: string; input: z.infer<typeof nodePatch> });
export type GraphSaveCurrent = { kind: "map"; saved: Roadmap } | { kind: "node"; saved: Omit<LearningNode, "stats"> };
export type GraphSaveOutcome = boolean | "unknown";
const nodeSchema = learningNodeSchema.omit({ stats: true });
const sameFields = (saved: object, input: object) => Object.entries(input).every(([key, value]) => JSON.stringify(Reflect.get(saved, key)) === JSON.stringify(value));

export async function requestGraphSave(target: GraphSaveTarget): Promise<GraphSaveCurrent> {
  const input = (target.kind === "map" ? roadmapPatch : nodePatch).safeParse(target.input);
  if (!input.success) throw new Error("入力内容を確認して再試行してください。");
  const path = target.kind === "map" ? `/roadmaps/${encodeURIComponent(target.mapId)}` : `/nodes/${encodeURIComponent(target.nodeId)}`;
  const payload = await request(`${path}?workspaceId=${encodeURIComponent(target.workspaceId)}`, "PATCH", input.data, { uncertainMutation: true, uncertainServerError: true });
  if (target.kind === "map") {
    const parsed = z.object({ roadmap: roadmapSchema }).safeParse(payload);
    if (!parsed.success || parsed.data.roadmap.id !== target.mapId || parsed.data.roadmap.workspaceId !== target.workspaceId || !sameFields(parsed.data.roadmap, input.data)) throw new UnknownMutationOutcome();
    return { kind: "map", saved: parsed.data.roadmap };
  }
  const parsed = z.object({ node: nodeSchema }).safeParse(payload);
  if (!parsed.success || parsed.data.node.id !== target.nodeId || parsed.data.node.roadmapId !== target.mapId || !sameFields(parsed.data.node, input.data)) throw new UnknownMutationOutcome();
  return { kind: "node", saved: parsed.data.node };
}

export async function readGraphSave(target: GraphSaveTarget): Promise<GraphSaveCurrent> {
  const detail = roadmapDetailSchema.parse(await request(`/roadmaps/${encodeURIComponent(target.mapId)}?workspaceId=${encodeURIComponent(target.workspaceId)}`));
  if (detail.roadmap.id !== target.mapId || detail.roadmap.workspaceId !== target.workspaceId) throw new Error("Save target unavailable");
  if (target.kind === "map") return { kind: "map", saved: detail.roadmap };
  const nodes = detail.nodes.filter((node) => node.id === target.nodeId && node.roadmapId === target.mapId);
  if (nodes.length !== 1) throw new Error("Save target unavailable");
  return { kind: "node", saved: nodes[0] };
}
