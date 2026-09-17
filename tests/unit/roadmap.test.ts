import { describe, expect, it } from "vitest";
import { edgeInput, nodeInput, nodePatch, roadmapInput } from "../../shared/roadmap";
describe("roadmap input validation", () => {
  it("position-only patches do not reset learner state or objectives", () => {
    expect(nodePatch.parse({ positionX: 15, positionY: 30 })).toEqual({ positionX: 15, positionY: 30 });
  });
  it("rejects blank titles, invalid status and non-finite positions", () => {
    expect(roadmapInput.safeParse({ title: "  " }).success).toBe(false);
    expect(nodeInput.safeParse({ roadmapId: "r", title: "n", status: "DONE" }).success).toBe(false);
    expect(nodePatch.safeParse({ positionX: Infinity }).success).toBe(false);
    expect(nodePatch.safeParse({ roadmapId: "other" }).success).toBe(false);
  });
  it("supports the three edge types and rejects self-links", () => {
    for (const type of ["PREREQUISITE", "PARENT", "RELATED"]) expect(edgeInput.safeParse({ roadmapId: "r", sourceId: "a", targetId: "b", type }).success).toBe(true);
    expect(edgeInput.safeParse({ roadmapId: "r", sourceId: "a", targetId: "a", type: "RELATED" }).success).toBe(false);
  });
});
