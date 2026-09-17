import type { SourceCheck } from "../../shared/review";
const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();
export function matchQuote(quote: string, source: string | null): SourceCheck["status"] {
  if (source === null) return "UNAVAILABLE";
  const text = normalize(quote); const body = normalize(source);
  if (text && body.includes(text)) return "VERIFIED";
  const parts = text.split(/(?<=[。.!?])\s*/).filter((part) => part.length >= 20);
  if (parts.some((part) => body.includes(part))) return "PARTIAL_MATCH";
  return "NOT_FOUND";
}
