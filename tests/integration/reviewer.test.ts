import { expect, it, vi } from "vitest";
import { structuredProvider } from "../../modules/review/structured-provider";
import { mockProvider } from "../../modules/review/mock-provider";
const claim = { id: "claim-0", text: "OAuthは認証プロトコルである。", startOffset: 0, endOffset: 17, type: "FACTUAL" as const };
const evidence = [{ id: "rfc6749", url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC", text: "OAuth 2.0 is an authorization framework", sourceType: "PRIMARY" as const, accessedAt: new Date().toISOString() }];
it("runs deterministic verification with mock without network or keys", async () => {
  const provider = mockProvider(); expect((await provider.verifyClaim(claim, evidence)).verdict).toBe("CONTRADICTED");
  expect((await provider.verifyClaim(claim, [])).verdict).toBe("INSUFFICIENT_EVIDENCE");
});
it("extracts and then classifies exact source claims through one shared strict adapter", async () => {
  const transport = vi.fn().mockResolvedValueOnce({ claims: [{ spanId: "span-0", text: claim.text }] }).mockResolvedValueOnce({ classifications: [{ id: "claim-0", type: "FACTUAL" }] });
  const result = await structuredProvider("test", transport).extractClaims(claim.text);
  expect(result[0].text).toBe(claim.text); expect(transport).toHaveBeenCalledTimes(2);
});
it("rejects fabricated claims, unknown evidence and malformed/provider failures", async () => {
  await expect(structuredProvider("test", async () => ({ claims: [{ spanId: "span-0", text: "invented" }] })).extractClaims(claim.text)).rejects.toThrow();
  await expect(structuredProvider("test", async () => ({ verdict: "CONTRADICTED", explanation: "issue", guidingQuestion: null, evidenceIds: ["fabricated"] })).verifyClaim(claim, evidence)).rejects.toThrow();
  await expect(structuredProvider("test", async () => ({ verdict: "SUPPORTED", explanation: "issue", guidingQuestion: null, evidenceIds: [] })).verifyClaim(claim, [])).rejects.toThrow();
  await expect(structuredProvider("test", async () => ({ findings: [], replacementText: "bad" })).reviewLogic("text")).rejects.toThrow();
  await expect(structuredProvider("test", async () => { throw new Error("private secret"); }).extractClaims("text")).rejects.toThrow(/^Review Providerが失敗/);
});
it("rejects invented objectives and logic targets in excluded regions", async () => {
  await expect(structuredProvider("test", async () => ({ results: [{ objectiveId: "invented", status: "COVERED", explanation: "", guidingQuestion: null }] })).reviewCoverage("text", [{ id: "human", text: "Objective" }])).rejects.toThrow();
  await expect(structuredProvider("test", async () => ({ findings: [{ category: "LOGIC", severity: "WARNING", explanation: "gap", guidingQuestion: null, targetText: "code", startOffset: 4, endOffset: 8 }] })).reviewLogic("```\ncode\n```")).rejects.toThrow();
});
