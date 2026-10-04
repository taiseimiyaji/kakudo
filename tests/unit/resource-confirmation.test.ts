import { afterEach, expect, it, vi } from "vitest";
import { confirmedResource } from "../../modules/resource/confirmation";
import { resourceInput } from "../../shared/resource";
import { checkResourceRegistration, registerResource, RESOURCE_CONFIRMATION_TIMEOUT_MS, RESOURCE_REGISTRATION_TIMEOUT_MS } from "../../client/resource-registration";
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
it("bounds a stalled confirmation GET and clears its deadline after a response", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn<typeof globalThis.fetch>((_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const outcome = checkResourceRegistration("/resources", "default", input).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(RESOURCE_CONFIRMATION_TIMEOUT_MS);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("接続を確認");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);

    fetch.mockImplementation(async () => new Response(JSON.stringify({ resources: [resource] })));
    expect(await checkResourceRegistration("/resources", "default", input)).toEqual(resource);
    const signal = fetch.mock.calls[1]?.[1]?.signal;
    await vi.advanceTimersByTimeAsync(RESOURCE_CONFIRMATION_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally { vi.useRealTimers(); }
});
it("bounds a confirmation whose response headers arrive but body never completes", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, options) => new Response(new ReadableStream({
      start(controller) { options?.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true }); },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const outcome = checkResourceRegistration("/resources", "default", input).then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(RESOURCE_CONFIRMATION_TIMEOUT_MS);
    expect(await outcome).toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
it("treats malformed or foreign successful registration payloads as unknown outcomes", async () => {
  for (const payload of [null, {}, { resource: { ...resource, workspaceId: "other" } }, { resource: { ...resource, url: "https://example.com/other" } }]) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status: 201 })));
    await expect(registerResource("/resources", "default", input)).rejects.toBeInstanceOf(UnknownMutationOutcome);
  }
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ resource }), { status: 201 })));
  expect(await registerResource("/resources", "default", input)).toEqual(resource);
});
it("bounds a stalled registration as uncertain without retrying its POST", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn<typeof globalThis.fetch>((_url, options) => new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    const attempt = registerResource("/resources", "default", input);
    const outcome = attempt.then(() => null, (error: unknown) => error);
    await vi.advanceTimersByTimeAsync(RESOURCE_REGISTRATION_TIMEOUT_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(UnknownMutationOutcome);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
it("clears the registration deadline after a successful response", async () => {
  vi.useFakeTimers();
  try {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ resource }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    expect(await registerResource("/resources", "default", input)).toEqual(resource);
    const signal = fetch.mock.calls[0]?.[1]?.signal;
    await vi.advanceTimersByTimeAsync(RESOURCE_REGISTRATION_TIMEOUT_MS);
    expect(signal?.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
