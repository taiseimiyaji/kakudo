import { expect, it, vi } from "vitest";
import { factSourcePipeline } from "../../modules/review/pipeline";
import { mockProvider } from "../../modules/review/mock-provider";
import { prepareSourceEvidence } from "../../modules/review/source-evidence";
import { matchQuote } from "../../modules/review/source-check";

const matched = "The retrieved source keeps the original human writing as the basis of review.";
const missing = " The additional quoted sentence is absent from the source.";
it("retains a literal partial match near the end of a long retrieved source", async () => {
  const text = "Unrelated background. ".repeat(1000) + matched + " Original trailing context.";
  const quote = { id: "owned-quote", text: matched + missing, sourceUrl: "https://example.com/source", sourceTitle: "Human source title" };
  const result = await factSourcePipeline({ markdown: "Human note", type: "SOURCE", groups: [], quotes: [quote] }, {
    provider: mockProvider(), fetcher: { async fetch(url) { return { url, text, title: "Fetched title", accessedAt: new Date().toISOString() }; } },
    search: { async search() { return []; } }, stage: async () => {},
  });
  expect(result.sourceChecks[0].status).toBe("PARTIAL_MATCH");
  expect(result.findings[0].evidence[0].text).toContain(matched);
  expect(result.findings[0].evidence[0].text.length).toBeLessThanOrEqual(1000);
  expect(text).toContain(result.findings[0].evidence[0].text);
  expect(result.findings[0]).toMatchObject({ sourceQuoteId: quote.id, targetText: null, startOffset: null, endOffset: null });
});

it.each([999 - matched.length, 1001 - matched.length, 1001, 19000])("keeps the complete literal match across the former excerpt boundary at %i", (at) => {
  const source = "X".repeat(at) + matched + "👩🏽‍💻".repeat(300);
  const result = prepareSourceEvidence(source)(matched + missing);
  expect(result.status).toBe("PARTIAL_MATCH"); expect(result.text).toContain(matched);
  expect(result.text.length).toBeLessThanOrEqual(1000); expect(result.text.isWellFormed()).toBe(true);
  expect(source).toContain(result.text); expect(result.fallbackReason).toBeUndefined();
  const boundaries = new Set([...new Intl.Segmenter("und", { granularity: "grapheme" }).segment(source)].map(s => s.index));
  boundaries.add(source.length); const start = source.indexOf(result.text);
  expect(boundaries.has(start)).toBe(true); expect(boundaries.has(start + result.text.length)).toBe(true);
});

it.each([
  matched.replace(/[A-Za-z]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0)),
  matched.replaceAll(" ", "\n  "),
  "Cafe\u0301 is the human source sentence.",
])("explains normalized-only matches without inventing raw offsets: %s", (raw) => {
  const quote = raw.normalize("NFKC").replace(/\s+/g, " ") + missing;
  const source = "Unrelated context. ".repeat(100) + raw;
  const result = prepareSourceEvidence(source)(quote);
  expect(result.status).toBe("PARTIAL_MATCH"); expect(result.fallbackReason).toContain("原文の同じ表記は見つかりませんでした");
  expect(result.fallbackReason).toContain("先頭部分"); expect(source.startsWith(result.text)).toBe(true);
});

it("explains matches beyond the cap and avoids splitting an oversized first grapheme", () => {
  const long = "A".repeat(1000) + ".";
  expect(prepareSourceEvidence("Context. " + long)(long + missing)).toMatchObject({ status: "PARTIAL_MATCH", fallbackReason: expect.stringContaining("抜粋上限") });
  const giant = "a" + "\u0301".repeat(1001);
  const result = prepareSourceEvidence(giant + matched.replaceAll(" ", "\n "))(matched + missing);
  expect(result).toMatchObject({ status: "PARTIAL_MATCH", text: "", fallbackReason: expect.stringContaining("抜粋がありません") });
});

it.each([
  ["", "", "NOT_FOUND"], ["short. absent", "short.", "NOT_FOUND"],
  ["x".repeat(19) + "." + missing, "x".repeat(19) + ".", "PARTIAL_MATCH"],
  ["x".repeat(18) + "." + missing, "x".repeat(18) + ".", "NOT_FOUND"],
  [matched + missing, matched + missing, "VERIFIED"], [matched + missing, "Different.", "NOT_FOUND"],
])("preserves verdict, full priority and the 20 UTF-16 threshold", (quote, source, status) => {
  expect(prepareSourceEvidence(source)(quote).status).toBe(status); expect(matchQuote(quote, source)).toBe(status);
});

it("normalizes a nearly 2MB shared source once for 384 quotes while preserving identities", async () => {
  const source = "Ａ" + "Unrelated context. ".repeat(100000) + matched;
  const normalize = vi.spyOn(String.prototype, "normalize"); const fetch = vi.fn(async (url: string) => ({ url, text: source, title: "Source", accessedAt: new Date().toISOString() }));
  try {
    const quotes = Array.from({ length: 384 }, (_, i) => ({ id: `quote-${i}`, text: matched + missing, sourceUrl: "https://example.com/shared", sourceTitle: null }));
    const result = await factSourcePipeline({ markdown: "Human text", type: "SOURCE", groups: [], quotes }, { provider: mockProvider(), fetcher: { fetch }, search: { async search() { return []; } }, stage: async () => {} });
    expect(fetch).toHaveBeenCalledTimes(1); expect(result.sourceChecks.map(c => c.quoteId)).toEqual(quotes.map(q => q.id));
    expect(result.findings).toHaveLength(384); expect(result.findings.every(f => f.evidence[0].text.includes(matched))).toBe(true);
    expect(normalize.mock.contexts.filter(context => String(context) === source)).toHaveLength(1);
  } finally { normalize.mockRestore(); }
});

it("keeps 384 different matching parts separate within one source", async () => {
  const parts = Array.from({ length: 384 }, (_, i) => `Unique human source sentence ${String(i).padStart(3, "0")} remains unchanged.`);
  const source = "Unrelated context. ".repeat(80000) + parts.join("\n");
  const fetch = vi.fn(async (url: string) => ({ url, text: source, title: "Source", accessedAt: new Date().toISOString() }));
  const quotes = parts.map((part, i) => ({ id: `unique-${i}`, text: part + missing, sourceUrl: "https://example.com/unique", sourceTitle: null }));
  const result = await factSourcePipeline({ markdown: "Human text", type: "SOURCE", groups: [], quotes }, { provider: mockProvider(), fetcher: { fetch }, search: { async search() { return []; } }, stage: async () => {} });
  expect(fetch).toHaveBeenCalledTimes(1); expect(result.findings).toHaveLength(384);
  for (let i = 0; i < parts.length; i++) {
    expect(result.findings[i].sourceQuoteId).toBe(quotes[i].id);
    expect(result.findings[i].evidence[0].text).toContain(parts[i]); expect(result.findings[i].evidence[0].text.length).toBeLessThanOrEqual(1000);
  }
});

it("keeps FULL source excerpts unchanged", async () => {
  const source = "Unrelated context. ".repeat(100) + matched;
  const result = await factSourcePipeline({ markdown: "Human text", type: "FULL", groups: [], quotes: [{ id: "full", text: matched + missing, sourceUrl: "https://example.com/full", sourceTitle: null }] }, { provider: { ...mockProvider(), async extractClaims() { return []; } }, fetcher: { async fetch(url) { return { url, text: source, title: "Source", accessedAt: new Date().toISOString() }; } }, search: { async search() { return []; } }, stage: async () => {} });
  expect(result.sourceChecks[0].status).toBe("PARTIAL_MATCH"); expect(result.findings[0].evidence[0].text).toBe(source.slice(0, 1000));
  expect(result.findings[0].explanation).toBe("引用の一部は確認できましたが、全体は一致していません。");
});
