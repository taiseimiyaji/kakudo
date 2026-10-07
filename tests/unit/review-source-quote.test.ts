import { expect, it } from "vitest";
import { sourceQuoteForFinding } from "../../modules/review/source-quote";
import type { SourceCheck, QuoteSnapshot } from "../../shared/review";

const quotes: QuoteSnapshot[] = [
  { id: "a", text: "First quote", sourceUrl: "https://example.com/same", sourceTitle: "Same source" },
  { id: "b", text: "Second quote", sourceUrl: "https://example.com/same", sourceTitle: "Same source" },
  { id: "c", text: "First quote", sourceUrl: "https://example.com/same", sourceTitle: "Same source" },
];
const checks: SourceCheck[] = quotes.map((quote) => ({ quoteId: quote.id, findingId: `finding-${quote.id}`, status: "NOT_FOUND", url: quote.sourceUrl, title: quote.sourceTitle!, accessedAt: "2026-10-07T00:00:00Z" }));

it("associates same-URL and duplicate-text quotes only through explicit IDs regardless of order", () => {
  for (const quote of quotes) expect(sourceQuoteForFinding({ id: `finding-${quote.id}`, category: "SOURCE" }, [...checks].reverse(), [quotes[1], quotes[2], quotes[0]])).toEqual(quote);
});
it("leaves legacy findings without an association unchanged even when URL, text or order could match", () => {
  expect(sourceQuoteForFinding({ id: "finding-a", category: "SOURCE" }, checks.map((check) => ({ ...check, findingId: undefined })), quotes)).toBeNull();
});
it("does not present a missing or ambiguous snapshot association as original text", () => {
  const finding = { id: "finding-a", category: "SOURCE" };
  expect(sourceQuoteForFinding(finding, checks, quotes.slice(1))).toBeNull();
  expect(sourceQuoteForFinding(finding, [...checks, checks[0]], quotes)).toBeNull();
  expect(sourceQuoteForFinding(finding, checks, [...quotes, quotes[0]])).toBeNull();
});
it("does not attach quote text to another review category", () => {
  expect(sourceQuoteForFinding({ id: "finding-a", category: "LOGIC" }, checks, quotes)).toBeNull();
});
