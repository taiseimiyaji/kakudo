import { expect, it, vi } from "vitest";
import { matchQuote } from "../../modules/review/source-check";
import { evidenceRetriever, orderedSources } from "../../modules/review/evidence";
import { verdictFinding } from "../../modules/review/pipeline";
import { mockProvider } from "../../modules/review/mock-provider";
it("distinguishes all four quote verification results", () => {
  expect(matchQuote("exact   quote", "prefix exact quote suffix")).toBe("VERIFIED");
  expect(matchQuote("A sufficiently long matching sentence. Missing sentence.", "A sufficiently long matching sentence.")).toBe("PARTIAL_MATCH");
  expect(matchQuote("missing", "other text")).toBe("NOT_FOUND"); expect(matchQuote("quote", null)).toBe("UNAVAILABLE");
});
it("keeps document-node-workspace priority and deduplicates URLs", () => {
  const source = (id: string, type = "WEB") => ({ id, url: `https://example.com/${id}`, title: id, type });
  expect(orderedSources([[source("doc")], [source("node"), source("doc")], [source("web"), source("rfc", "RFC")]]).map((g) => g.map((s) => s.id))).toEqual([["doc"], ["node"], ["rfc", "web"]]);
});
it("searches only after registered source scopes are exhausted", async () => {
  const visited: string[] = []; const fetcher = { async fetch(url: string) { visited.push(url); return { url, title: url, text: "evidence", accessedAt: new Date().toISOString() }; } };
  const search = { search: vi.fn(async () => { visited.push("SEARCH"); return [{ url: "https://example.com/web", title: "Web" }]; }) };
  const groups = ["document", "node", "workspace"].map((id) => [{ id, url: `https://example.com/${id}`, title: id, type: "WEB" }]);
  const claim = { id: "claim", text: "Claim", startOffset: 0, endOffset: 5, type: "FACTUAL" as const };
  await evidenceRetriever(fetcher, search, []).verify(claim, groups, mockProvider());
  expect(visited).toEqual(["https://example.com/document", "https://example.com/node", "https://example.com/workspace", "SEARCH", "https://example.com/web"]);
  visited.length = 0; search.search.mockClear();
  await evidenceRetriever(fetcher, search, []).verify(claim, groups, { ...mockProvider(), async verifyClaim(_claim, evidence) { return { verdict: "SUPPORTED", explanation: "Supported", guidingQuestion: null, evidenceIds: [evidence[0].id] }; } });
  expect(visited).toEqual(["https://example.com/document"]); expect(search.search).not.toHaveBeenCalled();
});
it("does not turn insufficient evidence into a contradiction or show supported claims", () => {
  const base = { explanation: "Reason", guidingQuestion: null, evidenceIds: [] };
  expect(verdictFinding({ ...base, verdict: "SUPPORTED" })).toBeNull();
  expect(verdictFinding({ ...base, verdict: "INSUFFICIENT_EVIDENCE" })).toEqual({ category: "FACT", severity: "INFO" });
  expect(verdictFinding({ ...base, verdict: "TIME_SENSITIVE" })?.category).toBe("FRESHNESS");
});
