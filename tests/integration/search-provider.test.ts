import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ transport: vi.fn(), response: vi.fn() }));
vi.mock("../../modules/review/transports", () => ({ SEARCH_POLICY: "Search references only", codexTransport: () => mocks.transport }));
vi.mock("openai", () => ({ default: class { responses = { create: mocks.response }; } }));
import { createSearchProvider } from "../../modules/review/search";
it("returns validated Codex source URLs and rejects unsupported schemes", async () => {
  mocks.transport.mockResolvedValue({ sources: [{ url: "https://example.com", title: "Source" }] });
  expect(await createSearchProvider({ REVIEW_PROVIDER: "codex" }).search("Claim")).toEqual([{ url: "https://example.com/", title: "Source" }]);
  mocks.transport.mockResolvedValue({ sources: [{ url: "file:///etc/passwd", title: "Bad" }] });
  await expect(createSearchProvider({ REVIEW_PROVIDER: "codex" }).search("Claim")).rejects.toThrow();
});
it("uses only web search citation annotations from OpenAI, not generated text URLs", async () => {
  mocks.response.mockResolvedValue({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "https://invented.example", annotations: [{ type: "url_citation", url: "https://example.com", title: "Source" }] }] }] });
  expect(await createSearchProvider({ SEARCH_PROVIDER: "openai", OPENAI_API_KEY: "test", OPENAI_MODEL: "test" }).search("Claim")).toEqual([{ url: "https://example.com/", title: "Source" }]);
  expect(mocks.response.mock.calls[0][0]).toMatchObject({ tools: [{ type: "web_search" }], store: false });
});
