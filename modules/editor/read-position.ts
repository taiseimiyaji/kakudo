export type ReadingPosition = { offset: number; viewportY: number };

// The rendered article and the Markdown source have different line heights and
// wrapping. Use source positions on visible blocks rather than a page scroll ratio.
export function captureReadingPosition(article: HTMLElement | null, header: HTMLElement | null): ReadingPosition | null {
  // Opening an untouched note at the top should keep the editor's start caret.
  if (!article || window.scrollY <= 32) return null;
  const viewportY = Math.min(window.innerHeight - 32, Math.max((header?.getBoundingClientRect().bottom ?? 0) + 24, window.innerHeight * 0.42));
  let closest: { distance: number; size: number; position: ReadingPosition } | null = null;
  for (const block of article.querySelectorAll<HTMLElement>("[data-source-start][data-source-end]")) {
    const start = Number(block.dataset.sourceStart), end = Number(block.dataset.sourceEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) continue;
    const rect = block.getBoundingClientRect();
    if (rect.height <= 0) continue;
    const distance = Math.max(rect.top - viewportY, viewportY - rect.bottom, 0);
    const fraction = Math.max(0, Math.min(1, (viewportY - rect.top) / rect.height));
    const candidate = { distance, size: end - start, position: { offset: Math.round(start + (end - start) * fraction), viewportY } };
    if (!closest || distance < closest.distance || (distance === closest.distance && candidate.size < closest.size)) closest = candidate;
  }
  return closest?.position ?? null;
}
