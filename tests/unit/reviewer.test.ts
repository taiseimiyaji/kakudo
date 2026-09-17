import { expect, it } from "vitest";
import { reviewSpans } from "../../modules/review/claims";
import { findingInput, verificationSchema } from "../../modules/review/contracts";
import { mockProvider } from "../../modules/review/mock-provider";
import { REVIEW_POLICY } from "../../modules/review/policy";
import { createReviewProvider } from "../../modules/review/provider";
import { CODEX_REVIEW_CONFIG, CODEX_THREAD } from "../../modules/review/transports";
it("excludes fenced/indented code, nested quotes and front matter while retaining original offsets", async () => {
  const markdown = '---\r\ntitle: hidden\r\n---\r\n# Note\r\n\r\n自分の主張。\r\n\r\n```ts\r\nhidden code\r\n```\r\n\r\n> hidden quote\r\n>\r\n> nested text\r\n\r\n    hidden indent\r\n\r\n続く主張。';
  const spans = reviewSpans(markdown); expect(spans.map((s) => s.text).join("\n")).not.toContain("hidden");
  for (const span of spans) expect(markdown.slice(span.startOffset, span.endOffset)).toBe(span.text);
  const claims = await mockProvider().extractClaims(markdown); expect(claims.map((c) => c.text)).toEqual(["自分の主張。", "続く主張。"]);
  for (const claim of claims) expect(markdown.slice(claim.startOffset, claim.endOffset)).toBe(claim.text);
});
it("classifies opinions, freshness and unverifiable assertions in the offline mock", async () => {
  expect((await mockProvider().extractClaims("現在の仕様。\n\n好きだと思う。\n\nそうかもしれない。\n\nOAuthは認証プロトコルである。")).map((c) => c.type)).toEqual(["TIME_SENSITIVE", "OPINION", "UNVERIFIABLE", "FACTUAL"]);
});
it.each(["replacementText", "correctedText", "suggestedMarkdown", "patch", "unknownField"])("rejects prohibited or unknown output field %s", (field) => {
  const input = { category: "FACT", severity: "WARNING", targetText: null, startOffset: null, endOffset: null, explanation: "Unsupported", guidingQuestion: null };
  expect(findingInput.safeParse({ ...input, [field]: "generated" }).success).toBe(false);
  expect(verificationSchema.safeParse({ verdict: "SUPPORTED", explanation: "evidence", guidingQuestion: null, evidenceIds: [], [field]: "generated" }).success).toBe(false);
});
it("defaults to Codex, keeps an explicit offline mock, and never falls back silently", () => {
  expect(createReviewProvider({}).name).toBe("codex"); expect(createReviewProvider({ REVIEW_PROVIDER: "mock" }).name).toBe("mock");
  expect(() => createReviewProvider({ REVIEW_PROVIDER: "other" })).toThrow(); expect(() => createReviewProvider({ REVIEW_PROVIDER: "openai" })).toThrow("OPENAI_MODEL");
  expect(REVIEW_POLICY).toContain("reviewer, not an author"); expect(REVIEW_POLICY).toContain("untrusted data");
  expect(CODEX_THREAD.sandboxMode).toBe("read-only"); expect(CODEX_THREAD.networkAccessEnabled).toBe(false);
  expect(CODEX_REVIEW_CONFIG.features).toMatchObject({ shell_tool: false, plugins: false, hooks: false, apps: false });
});
