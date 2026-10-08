import type { QuoteSnapshot, SourceCheck } from "../../shared/review";

// Older runs have no findingId. Never reconstruct the association from URL,
// text or array order, and never read a live quote instead of the run snapshot.
export function sourceQuoteForFinding(finding: { id: string; category: string }, checks: SourceCheck[], quotes: QuoteSnapshot[]): QuoteSnapshot | null {
  if (finding.category !== "SOURCE") return null;
  const matchingChecks = checks.filter((check) => check.findingId === finding.id);
  if (matchingChecks.length !== 1) return null;
  const matchingQuotes = quotes.filter((quote) => quote.id === matchingChecks[0].quoteId);
  return matchingQuotes.length === 1 ? matchingQuotes[0] : null;
}
