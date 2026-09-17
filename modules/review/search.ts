import { z } from "zod";
import OpenAI from "openai";
import { sourceUrlSchema } from "../../shared/quote";
import { codexTransport, SEARCH_POLICY } from "./transports";
import type { SearchProvider } from "./evidence";
const resultsSchema = z.object({ sources: z.array(z.object({ url: sourceUrlSchema, title: z.string().max(500) }).strict()).max(3) }).strict();
export function createSearchProvider(env: Record<string, string | undefined> = process.env): SearchProvider {
  const name = env.SEARCH_PROVIDER ?? env.REVIEW_PROVIDER ?? "codex";
  if (name === "mock") return { async search() { return []; } };
  if (name === "none") return { async search() { throw new Error("Web Search is disabled"); } };
  if (name === "codex") {
    const transport = codexTransport({ model: env.CODEX_MODEL, path: env.CODEX_PATH, searchOnly: true });
    // Transform-free JSON schema is required by the SDK; validate URL after parsing.
    const output = z.object({ sources: z.array(z.object({ url: z.string(), title: z.string() }).strict()).max(3) }).strict();
    return { async search(query) { return resultsSchema.parse(await transport("Search for at most 3 official/primary references for the supplied claim. Return only source URLs and titles.", { query }, output)).sources; } };
  }
  if (name === "openai") return { async search(query) {
    if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL) throw new Error("OpenAI Search is not configured");
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60000, maxRetries: 0 });
    const response = await client.responses.create({ model: env.OPENAI_MODEL, instructions: SEARCH_POLICY, input: JSON.stringify({ query }), tools: [{ type: "web_search" }], store: false });
    if (response.status !== "completed") throw new Error("Web Search failed");
    const sources: { url: string; title: string }[] = [];
    for (const item of response.output) if (item.type === "message") for (const part of item.content) if (part.type === "output_text") for (const citation of part.annotations) if (citation.type === "url_citation" && !sources.some((s) => s.url === citation.url)) sources.push({ url: citation.url, title: citation.title });
    return resultsSchema.parse({ sources: sources.slice(0, 3) }).sources;
  } };
  throw new Error("Invalid SEARCH_PROVIDER");
}
