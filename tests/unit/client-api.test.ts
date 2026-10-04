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

it.each([
  [400, "REVIEW_DOCUMENT_TOO_LONG", "60,000文字以内"],
  [400, "REVIEW_OBJECTIVES_LIMIT", "合計100件以内"],
  [409, "REVIEW_ALREADY_RUNNING", "Review履歴"],
  [409, "REVIEW_EXTERNAL_CONTENT_CHANGED", "本文を退避"],
])("shows client-owned guidance for scoped admission code %s %s", async (status, code, message) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code, error: "secret-token postgres://password stack" }), { status: Number(status) })));
  await expect(request("/documents/1/reviews?workspaceId=default", "POST", {})).rejects.toThrow(String(message));
  await expect(request("/documents/1/reviews", "POST", {})).rejects.not.toThrow(/secret|password|stack/);
});

it.each([
  ["/resources", "POST", 400, { code: "REVIEW_DOCUMENT_TOO_LONG" }],
  ["/documents/1/reviews", "GET", 400, { code: "REVIEW_DOCUMENT_TOO_LONG" }],
  ["/documents/1/reviews/extra", "POST", 400, { code: "REVIEW_DOCUMENT_TOO_LONG" }],
  ["/documents/1/reviews", "POST", 500, { code: "REVIEW_DOCUMENT_TOO_LONG" }],
  ["/documents/1/reviews", "POST", 400, { code: "REVIEW_ALREADY_RUNNING" }],
  ["/documents/1/reviews", "POST", 400, { code: "secret-stack" }],
  ["/documents/1/reviews", "POST", 400, { code: "constructor" }],
  ["/documents/1/reviews", "POST", 400, { code: "__proto__" }],
  ["/documents/1/reviews", "POST", 400, { code: { secret: "password" } }],
  ["/documents/1/reviews", "POST", 400, null],
])("keeps the safe fallback for mismatched or unknown admission payload %#", async (path, method, status, payload) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(payload), { status })));
  await expect(request(path, method, {})).rejects.toThrow(status === 500 ? "サーバーで処理できませんでした" : "入力内容を確認");
});
it("keeps the safe admission fallback for a non-JSON error", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("secret-host stack password", { status: 400 })));
  await expect(request("/documents/1/reviews", "POST", {})).rejects.toThrow("入力内容を確認");
});
