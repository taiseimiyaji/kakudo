import { expect, it } from "vitest";
import { readResourceList } from "../../client/resource-list";
import { resourceSchema } from "../../shared/resource";

const resource = { id: "owned-resource", workspaceId: "default", url: "https://example.com/reference", title: "Human reference", type: "WEB", createdAt: "2026-10-06T00:00:00Z" };

it("accepts an empty list and valid resources only in the requested workspace", () => {
  expect(readResourceList({ resources: [] }, "default")).toEqual([]);
  expect(readResourceList({ resources: [resource], futureMetadata: true }, "default")).toEqual([resource]);
  expect(readResourceList({ resources: [{ ...resource, workspaceId: "another" }] }, "another")).toEqual([{ ...resource, workspaceId: "another" }]);
});

it.each(["owned/ascii?%#", "日本語-ID", "資料-📚"])("preserves the valid Unicode/ASCII ID %s without normalizing it", (id) => {
  const stored = { ...resource, id };
  expect(readResourceList({ resources: [stored] }, "default")).toEqual([stored]);
});

it.each(["\uD800", "\uDC00", "owned-\uD800-tail"])("rejects the URI-unencodable ID %j before rendering", (id) => {
  const stored = { ...resource, id };
  // JSON and the general API schema accept it; list rendering cannot encode it.
  const payload: unknown = JSON.parse(JSON.stringify({ resources: [stored] }));
  expect(resourceSchema.safeParse(stored).success).toBe(true);
  expect(() => readResourceList(payload, "default")).toThrow(URIError);
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
