import { expect, it } from "vitest";
import { findingHighlight } from "../../modules/editor/review-highlight";
import { findingStatusInput } from "../../shared/review";
import { EditorState } from "@codemirror/state";
import { reviewHighlightField, setReviewHighlight } from "../../components/editor/highlight-extension";
it("maps exact CRLF source offsets to CodeMirror positions", () => {
  const snapshot = "# Note\r\n\r\n主張。"; const startOffset = snapshot.indexOf("主張");
  expect(findingHighlight({ revisionId: "a", snapshot, startOffset, endOffset: snapshot.length, targetText: "主張。" }, "a", snapshot)).toEqual({ from: 8, to: 11 });
});
it("refuses stale revisions, edited content, mismatched text and invalid ranges", () => {
  const selection = { revisionId: "a", snapshot: "Claim", startOffset: 0, endOffset: 5, targetText: "Claim" };
  expect(findingHighlight(selection, "b", "Claim")).toBeNull(); expect(findingHighlight(selection, "a", "New Claim")).toBeNull();
  expect(findingHighlight({ ...selection, endOffset: 100 }, "a", "Claim")).toBeNull(); expect(findingHighlight({ ...selection, startOffset: -1 }, "a", "Claim")).toBeNull(); expect(findingHighlight({ ...selection, targetText: "Other" }, "a", "Claim")).toBeNull();
});
it("clears CodeMirror highlights synchronously in the editing transaction", () => {
  let state = EditorState.create({ doc: "Claim", extensions: [reviewHighlightField] });
  state = state.update({ effects: setReviewHighlight.of({ from: 0, to: 5 }) }).state; expect(state.field(reviewHighlightField).size).toBe(1);
  state = state.update({ changes: { from: 0, insert: "new " } }).state; expect(state.field(reviewHighlightField).size).toBe(0);
});
it("permits only finding status changes, never a text patch", () => {
  for (const status of ["OPEN", "RESOLVED", "DISMISSED"]) expect(findingStatusInput.safeParse({ status }).success).toBe(true);
  expect(findingStatusInput.safeParse({ status: "APPLIED" }).success).toBe(false); expect(findingStatusInput.safeParse({ status: "RESOLVED", replacementText: "bad" }).success).toBe(false);
});
