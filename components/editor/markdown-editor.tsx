import { reviewHighlightField, setReviewHighlight } from "./highlight-extension";
import type { HighlightRange } from "../../modules/editor/review-highlight";
import { pasteAction, type InterceptedPaste } from "../../modules/editor/paste-policy";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { quoteEdit } from "../../modules/editor/quote-edit";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, isolateHistory } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";

export type MarkdownEditorHandle = { applyQuote: (paste: InterceptedPaste, after: string) => void; rememberPosition: () => void; restoreFocus: () => void };
export function MarkdownEditor({ initialContent, onChange, onPaste, onCompositionChange, highlight = null, editorRef }: { initialContent: string; onChange: (content: string) => void; onPaste: (paste: InterceptedPaste) => void; onCompositionChange?: (composing: boolean) => void; highlight?: HighlightRange | null; editorRef?: Ref<MarkdownEditorHandle> }) {
  const viewRef = useRef<EditorView | null>(null);
  const position = useRef<{ pageY: number; editorY: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  const pasteCallback = useRef(onPaste);
  const compositionCallback = useRef(onCompositionChange);
  useEffect(() => { compositionCallback.current = onCompositionChange; }, [onCompositionChange]);
  useImperativeHandle(editorRef, () => ({ rememberPosition() {
    const view = viewRef.current;
    if (view) position.current = { pageY: window.scrollY, editorY: view.scrollDOM.scrollTop };
  }, restoreFocus() {
    const view = viewRef.current;
    if (!view) return;
    view.focus();
    if (position.current) { view.scrollDOM.scrollTop = position.current.editorY; window.scrollTo({ top: position.current.pageY, behavior: "instant" }); }
  }, applyQuote(paste, after) {
    const view = viewRef.current;
    if (!view || view.state.sliceDoc() !== paste.content) throw new Error("編集中の本文が変わりました。最新の保存内容を確認してください。");
    view.dispatch({ ...quoteEdit(paste, after), annotations: isolateHistory.of("full"), userEvent: "input.paste" });
    view.focus();
  } }), []);
  useEffect(() => { pasteCallback.current = onPaste; }, [onPaste]);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: initialContent, extensions: [
      reviewHighlightField, lineNumbers(), history(), drawSelection(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), syntaxHighlighting(defaultHighlightStyle),
      EditorState.lineSeparator.of(initialContent.includes("\r\n") ? "\r\n" : "\n"), EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": "Markdown本文", role: "textbox", "aria-multiline": "true" }),
      EditorView.domEventHandlers({ compositionstart() { compositionCallback.current?.(true); }, compositionend() { compositionCallback.current?.(false); }, paste(event, view) {
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const kind = pasteAction(view.state, text);
        if (kind === "allow") return false;
        event.preventDefault();
        if (text) pasteCallback.current({ kind, text, content: view.state.sliceDoc(), from: view.state.sliceDoc(0, view.state.selection.main.from).length, to: view.state.sliceDoc(0, view.state.selection.main.to).length });
        return true;
      }, drop(event) { event.preventDefault(); return true; } }),
      EditorView.updateListener.of((update) => { if (update.docChanged) callback.current(update.state.sliceDoc()); }),
    ] }) });
    viewRef.current = view;
    return () => { viewRef.current = null; view.destroy(); };
    // A document session owns its initial content; parent keys remount it on reload.
  }, [initialContent]);
  useEffect(() => { const view = viewRef.current; if (!view) return; view.dispatch({ effects: highlight ? [setReviewHighlight.of(highlight), EditorView.scrollIntoView(highlight.from, { y: "center" })] : setReviewHighlight.of(null) }); if (highlight) view.focus(); }, [highlight, initialContent]);
  return <div className="markdown-editor" ref={host} />;
}
