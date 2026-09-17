export type FindingSelection = { revisionId: string; snapshot: string; startOffset: number | null; endOffset: number | null; targetText: string | null };
export type HighlightRange = { from: number; to: number };
export function findingHighlight(selection: FindingSelection | null, currentRevisionId: string | null, content: string): HighlightRange | null {
  if (!selection || selection.revisionId !== currentRevisionId || selection.snapshot !== content) return null;
  const { startOffset: from, endOffset: to, targetText } = selection;
  if (from === null || to === null || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > content.length || content.slice(from, to) !== targetText) return null;
  return { from: content.slice(0, from).replace(/\r\n/g, "\n").length, to: content.slice(0, to).replace(/\r\n/g, "\n").length };
}
