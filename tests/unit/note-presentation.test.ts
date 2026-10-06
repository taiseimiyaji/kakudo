import { expect, it, vi } from "vitest";
import { NoteSession, UnknownNoteWriteOutcome } from "../../modules/editor/note-session";
import { noteSavePresentation } from "../../modules/editor/note-presentation";

const initial = { title: "人間の名前", content: "人間の本文", hash: "h0", writeId: "w0", revisionId: "r0" };
const saved = { contentHash: "h1", document: { currentRevisionId: "r1", lastWriteId: "w1" } };

it("a matching GET baseline still displays a retry hold until an explicit write succeeds", async () => {
  const persist = vi.fn().mockResolvedValue(saved);
  const session = new NoteSession(initial, persist);
  session.acceptBase(initial);
  expect(session.getSnapshot().dirty).toBe(false);
  expect(noteSavePresentation(session.getSnapshot()).label).toBe("保存の再開待ち");
  session.tick(); expect(persist).not.toHaveBeenCalled();
  await session.save(true);
  expect(noteSavePresentation(session.getSnapshot()).label).toBe("保存済み");
});

it("returning the draft to its old baseline never hides an unknown write result", async () => {
  const persist = vi.fn().mockRejectedValue(new UnknownNoteWriteOutcome());
  const session = new NoteSession(initial, persist);
  session.edit({ content: "追加" }); await session.save(); session.edit({ content: initial.content });
  expect(session.getSnapshot().dirty).toBe(false);
  expect(noteSavePresentation(session.getSnapshot(), { composing: true, paste: true }).label).toBe("保存結果は不明です");
  expect(noteSavePresentation(session.getSnapshot(), { recovering: true }).detail).not.toContain("保存済み");
  session.tick(); expect(await session.save(true)).toBe(false); expect(persist).toHaveBeenCalledTimes(1);
});

it("an old successful acknowledgment cannot display a newer human draft as saved", async () => {
  let finish!: (value: typeof saved) => void;
  const session = new NoteSession(initial, () => new Promise(resolve => { finish = resolve; }));
  session.edit({ content: "先の入力" }); const writing = session.save(); await Promise.resolve();
  session.edit({ content: "後から考えた本文" });
  expect(noteSavePresentation(session.getSnapshot()).label).toBe("保存中…");
  finish(saved); await writing;
  expect(noteSavePresentation(session.getSnapshot()).label).toBe("未保存の変更");
  expect(session.getSnapshot().content).toBe("後から考えた本文");
});

it("known rejection, composition and a missing title explain the actual autosave pause", async () => {
  const session = new NoteSession(initial, vi.fn().mockRejectedValue(new Error("入力を確認")));
  session.edit({ content: "考察" });
  expect(noteSavePresentation(session.getSnapshot(), { composing: true }).detail).toContain("確定してから");
  session.edit({ title: " " });
  expect(noteSavePresentation(session.getSnapshot()).detail).toContain("ノート名");
  session.edit({ title: initial.title }); await session.save();
  expect(noteSavePresentation(session.getSnapshot()).detail).toContain("停止しています");
  expect(noteSavePresentation(session.getSnapshot()).detail).not.toContain("1秒");
});
