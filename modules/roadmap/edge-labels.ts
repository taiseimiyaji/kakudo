import { edgeTypes, type RoadmapEdge } from "../../shared/roadmap";

type EdgeIdentity = Pick<RoadmapEdge, "id" | "sourceId" | "targetId" | "type">;
export type EdgeLabelSlot = { count: number; offset: number };

/** Display-only slots for one unordered node pair; independent of API row order. */
export function edgeLabelSlots(edges: readonly EdgeIdentity[]): Map<string, EdgeLabelSlot> {
  const groups = new Map<string, EdgeIdentity[]>();
  const compare = (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1;
  for (const edge of edges) {
    const key = JSON.stringify([edge.sourceId, edge.targetId].sort(compare));
    const group = groups.get(key) ?? []; group.push(edge); groups.set(key, group);
  }
  const slots = new Map<string, EdgeLabelSlot>();
  for (const group of groups.values()) {
    group.sort((a, b) => compare(a.sourceId, b.sourceId) || edgeTypes.indexOf(a.type) - edgeTypes.indexOf(b.type) || compare(a.id, b.id));
    group.forEach((edge, index) => slots.set(edge.id, { count: group.length, offset: index - (group.length - 1) / 2 }));
  }
  return slots;
}
