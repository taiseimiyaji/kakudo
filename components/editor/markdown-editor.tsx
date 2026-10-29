import { reviewHighlightField, setReviewHighlight } from "./highlight-extension";
import type { FindingSelection, HighlightRange } from "../../modules/editor/review-highlight";
import { codePasteWithLineBreak, pasteAction, type InterceptedPaste } from "../../modules/editor/paste-policy";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { quoteEdit } from "../../modules/editor/quote-edit";
import { Compartment, EditorState, StateEffect, StateField, Text } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, invertedEffects, isolateHistory, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { installKeyboardReturn, type KeyboardReturn } from "./keyboard-return";
import { noteSearch, openNoteSearch } from "./note-search";

export type MarkdownEditorHandle = { openSearch: () => void; applyQuote: (paste: InterceptedPaste, after: string) => void; restoreContent: (content: string) => void; undoRestore: () => boolean; rememberPosition: () => void; restoreFocus: () => void };
export function MarkdownEditor({ initialContent, onChange, onPaste, onCompositionChange, highlight = null, highlightRequest = null, editorRef }: { initialContent: string; onChange: (content: string, historyEvent: "undo" | "redo" | null) => void; onPaste: (paste: InterceptedPaste) => void; onCompositionChange?: (composing: boolean) => void; highlight?: HighlightRange | null; highlightRequest?: FindingSelection | null; editorRef?: Ref<MarkdownEditorHandle> }) {
  const viewRef = useRef<EditorView | null>(null);
  const keyboardReturn = useRef<KeyboardReturn | null>(null);
  const lastHighlightRequest = useRef<FindingSelection | null>(null);
  const position = useRef<{ pageY: number; editorY: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  const pasteCallback = useRef(onPaste);
  const compositionCallback = useRef(onCompositionChange);
  const setLineBreak = useRef(StateEffect.define<string>()).current;
  const lineBreakCompartment = useRef(new Compartment()).current;
  const lineBreakField = useRef(StateField.define<string>({
    create: () => initialContent.includes("\r\n") ? "\r\n" : "\n",
    update: (value, transaction) => transaction.effects.find((effect) => effect.is(setLineBreak))?.value ?? value,
  })).current;
  useEffect(() => { compositionCallback.current = onCompositionChange; }, [onCompositionChange]);
  useImperativeHandle(editorRef, () => ({ openSearch() {
    if (viewRef.current) openNoteSearch(viewRef.current);
  }, rememberPosition() {
    const view = viewRef.current;
    if (view) position.current = { pageY: window.scrollY, editorY: view.scrollDOM.scrollTop };
  }, restoreFocus() {
    const view = viewRef.current;
    if (!view) return;
    keyboardReturn.current?.cancel();
    const remembered = position.current;
    position.current = null;
    view.focus();
    if (remembered) { view.scrollDOM.scrollTop = remembered.editorY; window.scrollTo({ top: remembered.pageY, behavior: "instant" }); }
  }, applyQuote(paste, after) {
    const view = viewRef.current;
    if (!view || view.state.sliceDoc() !== paste.content) throw new Error("編集中の本文が変わりました。最新の保存内容を確認してください。");
    keyboardReturn.current?.cancel();
    view.dispatch({ ...quoteEdit(paste, after), annotations: isolateHistory.of("full"), userEvent: "input.paste" });
    view.focus();
  }, restoreContent(content) {
    const view = viewRef.current;
    if (!view) throw new Error("ノートを閉じています");
    keyboardReturn.current?.cancel();
    const separator = content.includes("\r\n") ? "\r\n" : "\n";
    const transaction = view.state.update({ changes: { from: 0, to: view.state.doc.length, insert: Text.of(content.split(separator)) },
      effects: setLineBreak.of(separator), annotations: isolateHistory.of("full"), userEvent: "input.local-recovery" });
    if (transaction.state.sliceDoc() !== content) throw new Error("端末下書きの本文を編集器へ正確に復元できませんでした。");
    view.dispatch(transaction);
  }, undoRestore() {
    const view = viewRef.current;
    return !!view && undo(view);
  } }), []);
  useEffect(() => { pasteCallback.current = onPaste; }, [onPaste]);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: initialContent, extensions: [
      reviewHighlightField, lineNumbers(), history(), drawSelection(), noteSearch(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), syntaxHighlighting(defaultHighlightStyle),
      lineBreakField, lineBreakCompartment.of(EditorState.lineSeparator.of(initialContent.includes("\r\n") ? "\r\n" : "\n")),
      EditorState.transactionExtender.of((transaction) => {
        const separator = transaction.effects.find((effect) => effect.is(setLineBreak))?.value;
        return separator ? { effects: lineBreakCompartment.reconfigure(EditorState.lineSeparator.of(separator)) } : null;
      }),
      invertedEffects.of((transaction) => transaction.effects.filter((effect) => effect.is(setLineBreak)).map(() => setLineBreak.of(transaction.startState.field(lineBreakField)))), EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": "Markdown本文", role: "textbox", "aria-multiline": "true" }),
      EditorView.domEventHandlers({ compositionstart() { compositionCallback.current?.(true); }, compositionend() { compositionCallback.current?.(false); }, paste(event, view) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const kind = pasteAction(view.state, text);
        if (kind === "allow") {
          const insert = codePasteWithLineBreak(text, view.state.lineBreak);
          if (insert === text) return false;
          event.preventDefault();
          view.dispatch({ ...view.state.replaceSelection(insert), scrollIntoView: true, userEvent: "input.paste" });
          return true;
        }
        event.preventDefault();
        if (text) pasteCallback.current({ kind, text, content: view.state.sliceDoc(), from: view.state.sliceDoc(0, view.state.selection.main.from).length, to: view.state.sliceDoc(0, view.state.selection.main.to).length });
        return true;
      }, drop(event) { event.preventDefault(); return true; } }),
      EditorView.updateListener.of((update) => { if (update.docChanged) callback.current(update.state.sliceDoc(), update.transactions.some((transaction) => transaction.isUserEvent("redo")) ? "redo" : update.transactions.some((transaction) => transaction.isUserEvent("undo")) ? "undo" : null); }),
    ] }) });
    viewRef.current = view;
    const returning = installKeyboardReturn(view);
    keyboardReturn.current = returning;
    return () => { returning.destroy(); keyboardReturn.current = null; viewRef.current = null; view.destroy(); };
    // A document session owns its initial content; parent keys remount it on reload.
  }, [initialContent]);
  useEffect(() => {
    const view = viewRef.current; if (!view) return;
    keyboardReturn.current?.cancel();
    // Revalidating a decoration after Undo must preserve Undo's restored caret.
    const navigate = highlight && highlightRequest && highlightRequest !== lastHighlightRequest.current;
    lastHighlightRequest.current = highlightRequest;
    view.dispatch({
      effects: highlight ? [setReviewHighlight.of(highlight), EditorView.scrollIntoView(highlight.from, { y: "center" })] : setReviewHighlight.of(null),
      ...(navigate ? { selection: { anchor: highlight.from } } : {}),
    });
    if (highlight) view.focus();
  }, [highlight, highlightRequest, initialContent]);
  return <div className="markdown-editor" ref={host} />;
}
