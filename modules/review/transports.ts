import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodexOptions, ThreadOptions } from "@openai/codex-sdk";
import OpenAI from "openai";
import { z } from "zod";
import { ReviewProviderError } from "./contracts";
import { REVIEW_POLICY } from "./policy";
import { reviewPrompt, type StructuredTransport } from "./structured-provider";
export const CODEX_REVIEW_CONFIG: NonNullable<CodexOptions["config"]> = {
  developer_instructions: REVIEW_POLICY, project_doc_max_bytes: 0, web_search: "disabled",
  features: { shell_tool: false, unified_exec: false, apps: false, plugins: false, remote_plugin: false, hooks: false, multi_agent: false, multi_agent_v2: false, browser_use: false, browser_use_external: false, computer_use: false, image_generation: false, view_image: false, code_mode: false, code_mode_host: false, skill_search: false, skill_mcp_dependency_install: false, skip_host_skill_discovery: true },
};
export const CODEX_THREAD: ThreadOptions = { sandboxMode: "read-only", approvalPolicy: "never", skipGitRepoCheck: true, networkAccessEnabled: false, webSearchMode: "disabled" };
export function outputJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const result = z.toJSONSchema(schema); delete result.$schema; return result;
}
export function codexTransport({ model, path, timeoutMs = 120000 }: { model?: string; path?: string; timeoutMs?: number } = {}): StructuredTransport {
  return async (task, data, schema) => {
    const directory = await mkdtemp(join(tmpdir(), "kakudo-review-"));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const env: Record<string, string> = {};
      for (const key of ["HOME", "PATH", "USER", "TMPDIR", "CODEX_HOME", "SSL_CERT_FILE", "SSL_CERT_DIR"]) if (process.env[key]) env[key] = process.env[key]!;
      const { Codex } = await import("@openai/codex-sdk");
      const codex = new Codex({ codexPathOverride: path, env, config: CODEX_REVIEW_CONFIG, configOverrides: ["mcp_servers={}", "hooks={}", "plugins={}"] });
      const thread = codex.startThread({ ...CODEX_THREAD, model, workingDirectory: directory });
      const result = await thread.run(reviewPrompt(task, data), { outputSchema: outputJsonSchema(schema), signal: controller.signal });
      if (result.items.some((item) => ["command_execution", "file_change", "mcp_tool_call", "web_search"].includes(item.type))) throw new ReviewProviderError("Reviewerによるツール使用を検出しました。");
      return JSON.parse(result.finalResponse);
    } catch { throw new ReviewProviderError("Codex SDKのレビューに失敗しました。ローカルのログイン・モデル設定を確認してください。"); }
    finally { clearTimeout(timer); controller.abort(); await rm(directory, { recursive: true, force: true }); }
  };
}
export function openaiTransport({ apiKey, model, timeoutMs = 120000 }: { apiKey: string; model: string; timeoutMs?: number }): StructuredTransport {
  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 0 });
  return async (task, data, schema) => {
    try {
      const response = await client.responses.create({ model, instructions: REVIEW_POLICY, input: reviewPrompt(task, data), store: false, tools: [], text: { format: { type: "json_schema", name: "review_result", strict: true, schema: outputJsonSchema(schema) } } });
      if (response.status !== "completed" || !response.output_text) throw new ReviewProviderError();
      return JSON.parse(response.output_text);
    } catch { throw new ReviewProviderError("OpenAI APIのレビューに失敗しました。接続・モデル設定を確認してください。"); }
  };
}
