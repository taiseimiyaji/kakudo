import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { requestCreation } from "../../client/creation-request";
import { UnknownMutationOutcome } from "../../client/api";
import { DOCUMENT_CREATE_OUTCOME_UNKNOWN } from "../../shared/document";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ["/documents?workspaceId=default", 409, DOCUMENT_CREATE_OUTCOME_UNKNOWN, true],
  ["/documents", 409, DOCUMENT_CREATE_OUTCOME_UNKNOWN, true],
  ["/documents", 409, undefined, false],
  ["/documents", 409, "OTHER_CONFLICT", false],
  ["/documents", 400, DOCUMENT_CREATE_OUTCOME_UNKNOWN, false],
  ["/documents", 404, DOCUMENT_CREATE_OUTCOME_UNKNOWN, false],
  ["/roadmaps", 409, DOCUMENT_CREATE_OUTCOME_UNKNOWN, false],
  ["/documents/old/quotes", 409, DOCUMENT_CREATE_OUTCOME_UNKNOWN, false],
])("scopes journal recovery uncertainty to exact document-create status and code %#", async (path, status, code, uncertain) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code, error: "private-stack" }), { status })));
  const outcome = await requestCreation(path, {}, z.unknown()).catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(Error);
  expect(outcome instanceof UnknownMutationOutcome).toBe(uncertain);
  expect((outcome as Error).message).not.toContain("private-stack");
});
it("keeps a document-create 409 uncertain when its recovery discriminator cannot be read", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("private-invalid-json", { status: 409 })));
  await expect(requestCreation("/documents", {}, z.unknown())).rejects.toBeInstanceOf(UnknownMutationOutcome);
});
