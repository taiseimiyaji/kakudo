import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";

export function MarkdownEditor({ initialContent, onChange }: { initialContent: string; onChange: (content: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    const view = new EditorView({ parent: host.current!, state: EditorState.create({ doc: initialContent, extensions: [
      lineNumbers(), history(), drawSelection(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), syntaxHighlighting(defaultHighlightStyle),
      EditorState.lineSeparator.of(initialContent.includes("\r\n") ? "\r\n" : "\n"), EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": "Markdown本文", role: "textbox", "aria-multiline": "true" }),
      EditorView.updateListener.of((update) => { if (update.docChanged) callback.current(update.state.sliceDoc()); }),
    ] }) });
    return () => view.destroy();
    // A document session owns its initial content; parent keys remount it on reload.
  }, [initialContent]);
  return <div className="markdown-editor" ref={host} />;
}
