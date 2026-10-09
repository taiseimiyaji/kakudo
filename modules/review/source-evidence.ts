import type { SourceCheck } from "../../shared/review";
import { matchNormalizedQuote, normalizeSourceText } from "./source-check";

const cap = 1000;
type Excerpt = { text: string; fallbackReason?: string };
export type SourceEvidence = Excerpt & { status: SourceCheck["status"] };

// One immutable retrieved source per run. There are no normalized-to-raw offset arrays.
export function prepareSourceEvidence(source: string): (quote: string) => SourceEvidence {
  const normalized = normalizeSourceText(source);
  const wellFormed = source.isWellFormed();
  const segments = new Intl.Segmenter("und", { granularity: "grapheme" }).segment(source);
  const excerpts = new Map<string, Excerpt>();
  const floorBoundary = (offset: number) => offset >= source.length ? source.length : segments.containing(offset)!.index;
  const ceilBoundary = (offset: number) => {
    if (offset >= source.length) return source.length;
    const segment = segments.containing(offset)!;
    return offset === segment.index ? offset : segment.index + segment.segment.length;
  };
  const fallback = (reason: string): Excerpt => {
    const text = wellFormed ? source.slice(0, floorBoundary(cap)) : "";
    return { text, fallbackReason: text ? `${reason}取得資料の先頭部分を表示しています。` : `${reason}安全に表示できる抜粋がありません。` };
  };
  const literalExcerpt = (part: string): Excerpt => {
    const cached = excerpts.get(part); if (cached) return cached;
    let result: Excerpt;
    const at = source.indexOf(part);
    if (!wellFormed) result = fallback("取得原文に不完全な文字が含まれるため、一致箇所を抜粋できませんでした。");
    else if (at < 0) result = fallback("表記や空白の正規化後には一部一致しましたが、原文の同じ表記は見つかりませんでした。");
    else {
      const matchStart = floorBoundary(at); const matchEnd = ceilBoundary(at + part.length);
      if (matchEnd - matchStart > cap) result = fallback("原文の一致箇所が抜粋上限を超えるため、抜粋できませんでした。");
      else {
        const start = ceilBoundary(Math.max(0, matchStart - 200, matchEnd - cap));
        const text = source.slice(start, floorBoundary(start + cap));
        result = text.isWellFormed() && normalizeSourceText(text).includes(part) ? { text } : fallback("一致箇所を上限内で安全に抜粋できませんでした。");
      }
    }
    excerpts.set(part, result); return result;
  };
  return (quote) => {
    const matched = matchNormalizedQuote(quote, normalized);
    return { status: matched.status, ...(matched.matchedPart ? literalExcerpt(matched.matchedPart) : { text: source.slice(0, cap) }) };
  };
}
