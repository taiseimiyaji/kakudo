import { expect, it, vi } from "vitest";
import { z } from "zod";
const mocks = vi.hoisted(() => ({ run: vi.fn(), thread: vi.fn(), codex: vi.fn(), response: vi.fn(), openai: vi.fn() }));
vi.mock("@openai/codex-sdk", () => ({ Codex: class { constructor(options: unknown) { mocks.codex(options); } startThread(options: unknown) { mocks.thread(options); return { run: mocks.run }; } } }));
vi.mock("openai", () => ({ default: class { constructor(options: unknown) { mocks.openai(options); } responses = { create: mocks.response }; } }));
import { codexTransport, openaiTransport } from "../../modules/review/transports";
const schema = z.object({ findings: z.array(z.string()) }).strict();
it("invokes Codex with a read-only temporary directory, no inherited MCP and a JSON schema", async () => {
  mocks.run.mockResolvedValue({ items: [], finalResponse: '{"findings":[]}' });
  expect(await codexTransport()('Review', { text: "untrusted" }, schema)).toEqual({ findings: [] });
  expect(mocks.codex.mock.calls[0][0].configOverrides).toContain("mcp_servers={}");
  expect(mocks.thread.mock.calls[0][0]).toMatchObject({ sandboxMode: "read-only", approvalPolicy: "never", webSearchMode: "disabled" });
  expect(mocks.thread.mock.calls[0][0].workingDirectory).not.toBe(process.cwd());
  expect(mocks.run.mock.calls[0][0]).toContain("untrusted data");
  expect(mocks.run.mock.calls[0][1].outputSchema.additionalProperties).toBe(false);
  mocks.run.mockResolvedValue({ items: [{ type: "command_execution" }], finalResponse: '{"findings":[]}' });
  await expect(codexTransport()('Review', {}, schema)).rejects.toThrow();
});
it("invokes OpenAI Responses with strict structured output, no tools, and storage disabled", async () => {
  mocks.response.mockResolvedValue({ status: "completed", output_text: '{"findings":[]}' });
  expect(await openaiTransport({ apiKey: "test-key", model: "test-model" })('Review', {}, schema)).toEqual({ findings: [] });
  expect(mocks.response.mock.calls[0][0]).toMatchObject({ model: "test-model", tools: [], store: false, text: { format: { type: "json_schema", strict: true } } });
  mocks.response.mockResolvedValue({ status: "incomplete", output_text: '{"findings":[]}' });
  await expect(openaiTransport({ apiKey: "test-key", model: "test-model" })('Review', {}, schema)).rejects.toThrow();
});
it("enables only the separate search transport and requires an actual web-search event", async () => {
  mocks.run.mockResolvedValue({ items: [{ type: "web_search", query: "source" }], finalResponse: '{"findings":[]}' });
  expect(await codexTransport({ searchOnly: true })("Find URLs", {}, schema)).toEqual({ findings: [] });
  expect(mocks.thread.mock.lastCall![0].webSearchMode).toBe("live");
  expect(mocks.codex.mock.lastCall![0].config.features).toMatchObject({ shell_tool: false, plugins: false, code_mode_host: true });
  mocks.run.mockResolvedValue({ items: [], finalResponse: '{"findings":[]}' });
  await expect(codexTransport({ searchOnly: true })("Find URLs", {}, schema)).rejects.toThrow();
});
