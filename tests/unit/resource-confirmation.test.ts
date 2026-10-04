import { afterEach, expect, it, vi } from "vitest";
import { confirmedResource } from "../../modules/resource/confirmation";
import { resourceInput } from "../../shared/resource";
import { checkResourceRegistration, registerResource } from "../../client/resource-registration";
import { UnknownMutationOutcome } from "../../client/api";

const input = resourceInput.parse({ url: "https://example.com/confirmed", title: "Human title", type: "RFC" });
const resource = { ...input, id: "resource-1", workspaceId: "default", createdAt: "2026-10-04T00:00:00Z" };
afterEach(() => vi.unstubAllGlobals());
it("confirms only one exact stored match in the requested scope", () => {
  expect(confirmedResource([resource], "default", input)).toEqual(resource);
  for (const items of [[], null, {}, [resource, { ...resource, id: "resource-2" }], [{ ...resource, title: "Existing title" }], [{ ...resource, type: "WEB" }], [{ ...resource, workspaceId: "other" }], [{ ...resource, id: "" }], [{ ...resource, createdAt: null }], [{ ...resource, url: "https://example.com/other" }]]) {
    expect(confirmedResource(items, "default", input)).toBeNull();
  }
});
it("uses only GET for confirmation, leaving an absent result uncertain", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ resources: [] })));
  vi.stubGlobal("fetch", fetch);
  expect(await checkResourceRegistration("/documents/d/resources?workspaceId=default", "default", input)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
});
it("treats malformed or foreign successful registration payloads as unknown outcomes", async () => {
  for (const payload of [null, {}, { resource: { ...resource, workspaceId: "other" } }, { resource: { ...resource, url: "https://example.com/other" } }]) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 201 })));
    await expect(registerResource("/resources", "default", input)).rejects.toBeInstanceOf(UnknownMutationOutcome);
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ resource }), { status: 201 })));
  expect(await registerResource("/resources", "default", input)).toEqual(resource);
});
