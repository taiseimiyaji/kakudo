import { z } from "zod";
import { mockProvider } from "./mock-provider";
import { structuredProvider } from "./structured-provider";
import { codexTransport, openaiTransport } from "./transports";
import { ReviewProviderError, type ReviewProvider } from "./contracts";
const config = z.object({ REVIEW_PROVIDER: z.enum(["codex", "openai", "mock"]).default("codex"), CODEX_MODEL: z.string().min(1).optional(), CODEX_PATH: z.string().min(1).optional(), OPENAI_MODEL: z.string().min(1).optional(), OPENAI_API_KEY: z.string().min(1).optional(), REVIEW_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(120000) });
export function createReviewProvider(env: Record<string, string | undefined> = process.env): ReviewProvider {
  const result = config.safeParse(env); if (!result.success) throw new ReviewProviderError("Review設定が不正です。"); const c = result.data;
  if (c.REVIEW_PROVIDER === "mock") return mockProvider();
  if (c.REVIEW_PROVIDER === "codex") return structuredProvider("codex", codexTransport({ model: c.CODEX_MODEL, path: c.CODEX_PATH, timeoutMs: c.REVIEW_TIMEOUT_MS }));
  if (!c.OPENAI_MODEL || !c.OPENAI_API_KEY) throw new ReviewProviderError("OpenAI APIを使う場合はOPENAI_MODELとOPENAI_API_KEYを設定してください。");
  return structuredProvider("openai", openaiTransport({ apiKey: c.OPENAI_API_KEY, model: c.OPENAI_MODEL, timeoutMs: c.REVIEW_TIMEOUT_MS }));
}
