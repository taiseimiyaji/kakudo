import { EditorState } from "@codemirror/state";
import { history, isolateHistory, undo, redo } from "@codemirror/commands";
import { expect, it } from "vitest";
import { quoteEdit } from "../../modules/editor/quote-edit";
import { quoteMarkdown } from "../../shared/quote";

it.each(["\n", "\r\n"])("keeps typing and selected text in undo history with %j line endings", (separator) => {
  let state = EditorState.create({ doc: `First${separator}selected tail`, extensions: [history(), EditorState.lineSeparator.of(separator)] });
  state = state.update({ changes: { from: 0, insert: "My " }, userEvent: "input.type" }).state;
  const before = state.sliceDoc(); const from = before.indexOf("selected"); const to = from + "selected".length;
  const after = before.slice(0, from) + quoteMarkdown("Reference", "https://example.com/", undefined, separator) + before.slice(to);
  state = state.update({ ...quoteEdit({ kind: "quote", content: before, text: "Reference", from, to }, after), annotations: isolateHistory.of("full") }).state;
  expect(state.doc.toString()).toContain("> Reference");
  expect(state.doc.lines).toBeGreaterThan(2); expect(state.sliceDoc()).toBe(after);
  const target = { get state() { return state; }, dispatch(transaction: { state: EditorState }) { state = transaction.state; } };
  expect(undo(target)).toBe(true); expect(state.sliceDoc()).toBe(before);
  expect(redo(target)).toBe(true); expect(state.doc.toString()).toContain("> Reference");
  expect(undo(target)).toBe(true); expect(undo(target)).toBe(true);
  expect(state.sliceDoc()).toBe(`First${separator}selected tail`);
});
