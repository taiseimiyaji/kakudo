import type { SourceCheck } from "../../shared/review";
export const normalizeSourceText = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
export function matchNormalizedQuote(quote: string, body: string): { status: SourceCheck["status"]; matchedPart?: string } {
  const text = normalizeSourceText(quote);
  if (text && body.includes(text)) return { status: "VERIFIED" };
  const parts = text.split(/(?<=[。.!?])\s*/).filter((part) => part.length >= 20);
  const matchedPart = parts.find((part) => body.includes(part));
  return matchedPart ? { status: "PARTIAL_MATCH", matchedPart } : { status: "NOT_FOUND" };
}
export function matchQuote(quote: string, source: string | null): SourceCheck["status"] {
  if (source === null) return "UNAVAILABLE";
  return matchNormalizedQuote(quote, normalizeSourceText(source)).status;
}
