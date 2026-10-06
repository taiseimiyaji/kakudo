import type { NoteState } from "./note-session";

/** Presentation only: none of these messages authorizes a write or clears a hold. */
export function noteSavePresentation(state: NoteState, { recovering = false, composing = false, paste = false } = {}) {
  if (recovering) return { label: state.outcomeUnknown ? "保存結果は不明です" : "確認中…", detail: "最新の保存内容を確認中です。自動保存を停止しています。", attention: true };
  if (state.saving) return { label: "保存中…", detail: "応答を確認するまで、現在の入力の保存は確定していません。", attention: false };
  if (state.outcomeUnknown) return { label: "保存結果は不明です", detail: "自動保存を停止しています。最新の保存内容を確認してください。", attention: true };
  if (state.error) return { label: "保存できませんでした", detail: "自動保存を停止しています。入力内容はこの画面に残っています。", attention: true };
  if (state.retryRequired) return { label: "保存の再開待ち", detail: "確認だけでは保存されません。「保存を再試行」で保存を再開できます。", attention: true };
  if (composing) return { label: state.dirty ? "未保存の変更" : "入力中", detail: "入力が確定してから保存します。", attention: false };
  if (paste) return { label: state.dirty ? "未保存の変更" : "保存済み", detail: "引用・資料の操作中は本文の自動保存を一時停止しています。", attention: false };
  if (!state.title.trim()) return { label: "未保存の変更", detail: "ノート名を入力すると自動保存できます。", attention: true };
  if (state.dirty) return { label: "未保存の変更", detail: "自動保存を待っています。", attention: false };
  return { label: "保存済み", detail: "変更があれば自動保存します。", attention: false };
}
