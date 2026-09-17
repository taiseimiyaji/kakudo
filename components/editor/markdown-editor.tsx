import { reviewHighlightField, setReviewHighlight } from "./highlight-extension";
import type { HighlightRange } from "../../modules/editor/review-highlight";
import { pasteAction, type InterceptedPaste } from "../../modules/editor/paste-policy";
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";

export function MarkdownEditor({ initialContent, onChange, onPaste, highlight = null }: { initialContent: string; onChange: (content: string) => void; onPaste: (paste: InterceptedPaste) => void; highlight?: HighlightRange | null }) {
  const viewRef = useRef<EditorView | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  const pasteCallback = useRef(onPaste);
  useEffect(() => { pasteCallback.current = onPaste; }, [onPaste]);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: initialContent, extensions: [
      reviewHighlightField, lineNumbers(), history(), drawSelection(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), syntaxHighlighting(defaultHighlightStyle),
      EditorState.lineSeparator.of(initialContent.includes("\r\n") ? "\r\n" : "\n"), EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": "Markdown本文", role: "textbox", "aria-multiline": "true" }),
      EditorView.domEventHandlers({ paste(event, view) {
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
