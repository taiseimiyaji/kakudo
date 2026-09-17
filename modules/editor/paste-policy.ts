import type { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { sourceUrlSchema } from "../../shared/quote";

export function rangeInsideCode(state: EditorState, from: number, to: number): boolean {
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, to + 1), 50);
  if (!tree) return false;
  let inside = false;
  tree.iterate({ from, to: Math.min(state.doc.length, to + 1), enter(ref) {
    if (ref.name !== "FencedCode" && ref.name !== "CodeBlock") return;
    let start = ref.from; let end = ref.to;
    if (ref.name === "FencedCode") {
      start = state.doc.lineAt(ref.from).to + 1;
      const closing = ref.node.lastChild;
      if (closing?.name === "CodeMark" && closing.from !== ref.from) end = state.doc.lineAt(closing.from).from - 1;
    }
    if (from >= start && to <= end) inside = true;
  } });
  return inside;
}
export function pasteAction(state: EditorState, text: string): "allow" | "resource" | "quote" {
  if (state.selection.ranges.every((range) => rangeInsideCode(state, range.from, range.to))) return "allow";
  if (sourceUrlSchema.safeParse(text.trim()).success && !/\s/.test(text.trim())) return "resource";
  return "quote";
}
export type InterceptedPaste = { kind: "quote" | "resource"; text: string; content: string; from: number; to: number };
