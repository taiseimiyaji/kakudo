import { describe, expect, it } from "vitest";
import { edgeLabelSlots } from "../../modules/roadmap/edge-labels";
import { edgeTypes } from "../../shared/roadmap";

describe("parallel connection display slots", () => {
  it("isolates node pairs, including IDs containing separators, and keeps singles centered", () => {
    const edges = [{ id: "one", sourceId: "a:b", targetId: "c", type: "RELATED" }, { id: "two", sourceId: "a", targetId: "b:c", type: "RELATED" }] as const;
    expect([...edgeLabelSlots(edges).values()]).toEqual([{ count: 1, offset: 0 }, { count: 1, offset: 0 }]);
  });
  it("separates all relationship types in both directions without mutating input or depending on row order", () => {
    const edges = Object.freeze([...["a", "b"].flatMap((sourceId) => edgeTypes.map((type) => Object.freeze({ id: `${sourceId}:${type}`, sourceId, targetId: sourceId === "a" ? "b" : "a", type })))]);
    const slots = edgeLabelSlots(edges);
    expect(new Set([...slots.values()].map((slot) => slot.offset)).size).toBe(6);
    expect([...slots.values()].reduce((sum, slot) => sum + slot.offset, 0)).toBe(0);
    expect([...slots.values()].every((slot) => slot.count === 6)).toBe(true);
    expect(edgeLabelSlots([...edges].reverse())).toEqual(slots);
  });
  it("recenters surviving labels and returns to the original rendering when only one edge remains", () => {
    const edges = edgeTypes.map((type) => ({ id: type, sourceId: "a", targetId: "b", type }));
    expect([...edgeLabelSlots(edges).values()].map((slot) => slot.offset)).toEqual([-1, 0, 1]);
    expect(edgeLabelSlots(edges.slice(0, 1)).get(edges[0].id)).toEqual({ count: 1, offset: 0 });
  });
});
