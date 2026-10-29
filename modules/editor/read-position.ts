export type ReadingPosition = { offset: number; viewportY: number };

export function readingViewportY(header: HTMLElement | null) {
  return Math.min(window.innerHeight - 32, Math.max((header?.getBoundingClientRect().bottom ?? 0) + 24, window.innerHeight * 0.42));
}

// The rendered article and the Markdown source have different line heights and
// wrapping. Use source positions on visible blocks rather than a page scroll ratio.
export function captureReadingPosition(article: HTMLElement | null, header: HTMLElement | null): ReadingPosition | null {
  // Opening an untouched note at the top should keep the editor's start caret.
  if (!article || window.scrollY <= 32) return null;
  const viewportY = readingViewportY(header);
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

function textRectAt(block: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let text: Node | null, remaining = Math.max(0, Math.round(offset));
  while ((text = walker.nextNode())) {
    const length = text.textContent?.length ?? 0;
    if (remaining > length) { remaining -= length; continue; }
    const range = document.createRange();
    range.setStart(text, remaining); range.collapse(true);
    return range.getBoundingClientRect();
  }
  return null;
}

function renderedTextRect(block: HTMLElement, offset: number) {
  if (!block.dataset.sourceTextMap) return null;
  try {
    const segments = JSON.parse(block.dataset.sourceTextMap) as number[][];
    let closest: { distance: number; from: number; to: number; textFrom: number; textTo: number } | null = null;
    for (const [from, to, textFrom, textTo] of segments) {
      const distance = Math.max(from - offset, offset - to, 0);
      if (!closest || distance < closest.distance) closest = { distance, from, to, textFrom, textTo };
    }
    if (!closest) return null;
    const fraction = closest.to === closest.from ? 0 : Math.max(0, Math.min(1, (offset - closest.from) / (closest.to - closest.from)));
    return textRectAt(block, closest.textFrom + (closest.textTo - closest.textFrom) * fraction);
  } catch { return null; }
}

function codeLineRect(block: HTMLElement, source: string, start: number, end: number, offset: number) {
  const code = block.querySelector<HTMLElement>("code");
  if (!code) return null;
  const fenced = /^\s*(```|~~~)/.test(source.slice(start, end));
  const sourceLines = source.slice(start, offset).match(/\n/g)?.length ?? 0;
  const targetLine = Math.max(0, sourceLines - (fenced ? 1 : 0));
  const rendered = code.textContent ?? "";
  let textOffset = 0;
  for (let line = 0; line < targetLine; line++) {
    const next = rendered.indexOf("\n", textOffset);
    if (next < 0) break;
    textOffset = next + 1;
  }
  return textRectAt(code, textOffset);
}

export function restoreReadingPosition(article: HTMLElement | null, { offset, viewportY }: ReadingPosition, source: string) {
  if (!article) return;
  let closest: { distance: number; size: number; block: HTMLElement; start: number; end: number } | null = null;
  for (const block of article.querySelectorAll<HTMLElement>("[data-source-start][data-source-end]")) {
    const start = Number(block.dataset.sourceStart), end = Number(block.dataset.sourceEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) continue;
    const distance = Math.max(start - offset, offset - end, 0);
    const candidate = { distance, size: end - start, block, start, end };
    if (!closest || distance < closest.distance || (distance === closest.distance && candidate.size < closest.size)) closest = candidate;
  }
  if (!closest) return;
  const rect = closest.block.getBoundingClientRect();
  const fraction = closest.end === closest.start ? 0 : Math.max(0, Math.min(1, (offset - closest.start) / (closest.end - closest.start)));
  const exact = closest.block.tagName === "PRE" ? codeLineRect(closest.block, source, closest.start, closest.end, offset) : renderedTextRect(closest.block, offset);
  window.scrollBy({ top: (exact?.top ?? rect.top + rect.height * fraction) - viewportY, behavior: "instant" });
}
