import { afterEach, expect, it, vi } from "vitest";
import { request } from "../../client/api";
afterEach(() => vi.unstubAllGlobals());
it.each([400, 401, 403, 404, 409, 413, 422, 429, 500, 502])("does not expose server diagnostics for HTTP %s", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "secret-token internal stack postgres://password" }), { status })));
  await expect(request("/resources")).rejects.toThrow(/[ぁ-んァ-ン一-龥]/);
  await expect(request("/resources")).rejects.not.toThrow(/secret|stack|password/);
});
it("normalizes network and invalid JSON failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-host")));
  await expect(request("/resources")).rejects.toThrow("接続を確認");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid")));
  await expect(request("/resources")).rejects.toThrow("応答を読み取れません");
});
it("accepts empty deletion responses", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  await expect(request("/resources/1", "DELETE")).resolves.toBeUndefined();
});
