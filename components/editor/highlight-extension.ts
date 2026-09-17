import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import type { HighlightRange } from "../../modules/editor/review-highlight";
export const setReviewHighlight = StateEffect.define<HighlightRange | null>();
export const reviewHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) return Decoration.none;
    for (const effect of transaction.effects) if (effect.is(setReviewHighlight)) {
      const range = effect.value;
      return range && range.from >= 0 && range.to <= transaction.state.doc.length && range.from < range.to ? Decoration.set([Decoration.mark({ class: "review-highlight" }).range(range.from, range.to)]) : Decoration.none;
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
