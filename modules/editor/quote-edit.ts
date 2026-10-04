import type { InterceptedPaste } from "./paste-policy";
import { Text } from "@codemirror/state";

// Paste selections use original Markdown offsets; CodeMirror uses normalized LF offsets.
export function quoteEdit(paste: InterceptedPaste, after: string) {
  const normalize = (text: string) => text.replace(/\r\n|\r/g, "\n");
  const tailLength = paste.content.length - paste.to;
  const insert = Text.of(normalize(after.slice(paste.from, after.length - tailLength)).split("\n"));
  const from = normalize(paste.content.slice(0, paste.from)).length;
  const to = normalize(paste.content.slice(0, paste.to)).length;
  return { changes: { from, to, insert }, selection: { anchor: from + insert.length } };
}
