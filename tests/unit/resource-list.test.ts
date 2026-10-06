import { expect, it } from "vitest";
import { readResourceList } from "../../client/resource-list";

const resource = { id: "owned-resource", workspaceId: "default", url: "https://example.com/reference", title: "Human reference", type: "WEB", createdAt: "2026-10-06T00:00:00Z" };

it("accepts an empty list and valid resources only in the requested workspace", () => {
  expect(readResourceList({ resources: [] }, "default")).toEqual([]);
  expect(readResourceList({ resources: [resource], futureMetadata: true }, "default")).toEqual([resource]);
  expect(readResourceList({ resources: [{ ...resource, workspaceId: "another" }] }, "another")).toEqual([{ ...resource, workspaceId: "another" }]);
});

it.each([
  ["missing envelope", null],
  ["missing list", {}],
  ["non-array list", { resources: {} }],
  ["null list", { resources: null }],
  ["invalid resource", { resources: [null] }],
  ["invalid URL", { resources: [{ ...resource, url: "javascript:alert(1)" }] }],
  ["invalid title", { resources: [{ ...resource, title: {} }] }],
  ["invalid resource type", { resources: [{ ...resource, type: "UNKNOWN" }] }],
  ["missing identity", { resources: [{ ...resource, id: "" }] }],
  ["foreign workspace", { resources: [{ ...resource, workspaceId: "another" }] }],
  ["partially invalid list", { resources: [resource, { ...resource, id: "foreign", workspaceId: "another" }] }],
])("rejects the entire %s before it can replace known resources", (_name, payload) => {
  expect(() => readResourceList(payload, "default")).toThrow();
});
