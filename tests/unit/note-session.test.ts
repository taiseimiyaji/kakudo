import { describe, expect, it, vi } from "vitest";
import { NoteSession, UnknownNoteWriteOutcome, type NoteSaveResult } from "../../modules/editor/note-session";
const initial = { title: "ノート", content: "", hash: "initial-hash", revisionId: "r0", writeId: "w0" };
const result = (hash: string): NoteSaveResult => ({ contentHash: hash, document: { currentRevisionId: hash, lastWriteId: "write-" + hash } });
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe("note autosave queue", () => {
  it("does not write unchanged content and serializes slow saves while retaining later edits", async () => {
    const first = deferred<NoteSaveResult>();
    const persist = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(result("h2"));
    const session = new NoteSession(initial, persist);
    session.tick(); await session.save(); expect(persist).not.toHaveBeenCalled();
    session.edit({ content: "first" }); session.tick(); const saving = session.save();
    await Promise.resolve(); expect(persist).toHaveBeenCalledTimes(1);
    session.edit({ content: "newer", title: "New title" }); session.tick(); session.tick();
    expect(persist).toHaveBeenCalledTimes(1);
    first.resolve(result("h1")); await saving;
    expect(session.getSnapshot()).toMatchObject({ content: "newer", title: "New title", dirty: true, saved: { content: "first", hash: "h1" } });
    session.tick(); await session.save();
    expect(persist).toHaveBeenLastCalledWith({ content: "newer", title: "New title", baseHash: "h1", baseWriteId: "write-h1" });
    expect(session.getSnapshot()).toMatchObject({ dirty: false, revisionId: "h2" });
    session.tick(); expect(persist).toHaveBeenCalledTimes(2);
  });
  it("retains drafts and pauses retries after failure until explicitly retried", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("conflict")).mockResolvedValue(result("h1"));
    const session = new NoteSession(initial, persist);
    session.edit({ content: "my words" }); expect(await session.save()).toBe(false);
    session.edit({ content: "more words" }); session.tick(); await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ dirty: true, error: "conflict", content: "more words", saved: { hash: "initial-hash" } });
    expect(await session.save()).toBe(true);
    expect(persist).toHaveBeenLastCalledWith({ title: initial.title, content: "more words", baseHash: "initial-hash", baseWriteId: "w0" });
  });
  it("waits for an in-flight autosave before quoting and uses its returned hash", async () => {
    const pending = deferred<NoteSaveResult>();
    const persist = vi.fn().mockReturnValue(pending.promise);
    const quote = vi.fn().mockResolvedValue({ ...result("quoted"), content: "typed\n> cited" });
    const session = new NoteSession(initial, persist);
    session.edit({ content: "typed" }); session.tick(); await Promise.resolve();
    const quoting = session.addQuote("typed", quote, vi.fn());
    session.tick(); expect(quote).not.toHaveBeenCalled();
    pending.resolve(result("typed-hash")); await quoting;
    expect(quote).toHaveBeenCalledWith({ title: initial.title, content: "typed", baseHash: "typed-hash", baseWriteId: "write-typed-hash" });
    expect(session.getSnapshot()).toMatchObject({ dirty: false, content: "typed\n> cited", saved: { hash: "quoted" } });
    session.setPaused(false); session.tick(); expect(persist).toHaveBeenCalledTimes(1);
  });
  it("skips composition, a paste dialog and invalid titles without losing edits", async () => {
    const persist = vi.fn().mockResolvedValue(result("h1"));
    const session = new NoteSession(initial, persist);
    session.edit({ content: "日本語" }); session.setComposing(true); session.tick();
    expect(await session.save()).toBe(false);
    session.setComposing(false); session.setPaused(true); session.tick();
    session.setPaused(false); session.edit({ title: " " }); session.tick();
    expect(persist).not.toHaveBeenCalled();
    session.edit({ title: "学習" }); session.tick(); await session.save(); expect(persist).toHaveBeenCalledTimes(1);
  });
  it("waits for saving before deletion and never saves after successful deletion", async () => {
    const pending = deferred<NoteSaveResult>();
    const persist = vi.fn().mockReturnValue(pending.promise);
    const remove = vi.fn().mockResolvedValue(undefined);
    const session = new NoteSession(initial, persist);
    session.edit({ content: "first" }); session.tick(); await Promise.resolve();
    const deleting = session.remove(remove); session.edit({ content: "later" }); session.tick();
    expect(remove).not.toHaveBeenCalled();
    pending.resolve(result("h1")); await deleting;
    session.tick(); expect(await session.save()).toBe(false); expect(persist).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe("autosave integration with current concurrency protection", () => {
  it("serializes related-node writes after autosave and uses their write ID for the next draft", async () => {
    const pending = deferred<NoteSaveResult>();
    const persist = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(result("h2"));
    const context = vi.fn().mockResolvedValue({ document: { lastWriteId: "linked-write" } });
    const session = new NoteSession(initial, persist);
    session.edit({ content: "first" }); session.tick(); await Promise.resolve();
    const linking = session.updateContext(context);
    session.edit({ content: "second", title: "Newer title" }); session.tick();
    expect(context).not.toHaveBeenCalled();
    pending.resolve(result("h1")); await linking;
    expect(context).toHaveBeenCalledWith("write-h1");
    expect(session.getSnapshot()).toMatchObject({ dirty: true, content: "second", saved: { content: "first", writeId: "linked-write" } });
    session.tick(); await session.save();
    expect(persist).toHaveBeenLastCalledWith({ content: "second", title: "Newer title", baseHash: "h1", baseWriteId: "linked-write" });
  });
  it("confirming a latest baseline retains the draft and requires explicit retry before timers resume", async () => {
    const persist = vi.fn().mockRejectedValueOnce(new Error("conflict")).mockResolvedValue(result("recovered"));
    const session = new NoteSession(initial, persist);
    session.edit({ content: "Local words", title: "Local title" }); await session.save();
    session.acceptBase({ content: "Other words", title: "Other title", hash: "other-hash", writeId: "other-write", revisionId: "other-revision" });
    session.tick(); session.tick(); await Promise.resolve();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ content: "Local words", title: "Local title", error: "", dirty: true, retryRequired: true });
    await session.save();
    expect(persist).toHaveBeenLastCalledWith({ content: "Local words", title: "Local title", baseHash: "other-hash", baseWriteId: "other-write" });
    expect(session.getSnapshot()).toMatchObject({ retryRequired: false, dirty: false });
  });
  it("a failed in-flight save blocks queued quote and link requests while retaining the draft", async () => {
    const pending = deferred<NoteSaveResult>();
    const quote = vi.fn(); const context = vi.fn();
    const session = new NoteSession(initial, () => pending.promise);
    session.edit({ content: "Human words" }); const saving = session.save();
    const quoting = session.addQuote("Human words", quote, vi.fn());
    const linking = session.updateContext(context);
    pending.reject(new Error("Save response lost"));
    const results = await Promise.allSettled([saving, quoting, linking]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "rejected"]);
    expect(quote).not.toHaveBeenCalled(); expect(context).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toMatchObject({ content: "Human words", saved: { writeId: "w0" }, dirty: true, retryRequired: true, saving: false });
  });
  it("keeps an explicit nullable write ID and isolates quote application from editor replacement", async () => {
    const quote = vi.fn().mockResolvedValue({ ...result("q"), content: "Human words\n> Cited" });
    const apply = vi.fn();
    const session = new NoteSession({ ...initial, writeId: null }, vi.fn());
    session.edit({ content: "Human words" });
    await session.addQuote("Human words", quote, apply);
    expect(quote).toHaveBeenCalledWith({ content: "Human words", title: initial.title, baseHash: initial.hash, baseWriteId: null });
    expect(apply).toHaveBeenCalledWith("Human words\n> Cited");
    expect(session.getSnapshot()).toMatchObject({ saved: { writeId: "write-q" }, dirty: false });
  });
});

it("explicit save can record external Markdown after reload while unchanged ticks stay silent", async () => {
  const persist = vi.fn().mockResolvedValue(result("external-revision"));
  const session = new NoteSession(initial, persist);
  session.tick(); expect(persist).not.toHaveBeenCalled();
  expect(await session.save(true)).toBe(true);
  expect(persist).toHaveBeenCalledWith({ content: initial.content, title: initial.title, baseHash: initial.hash, baseWriteId: initial.writeId });
  session.tick(); expect(persist).toHaveBeenCalledTimes(1);
});

it("unknown save retains later human edits and blocks every mutation until explicit baseline confirmation", async () => {
  const pending = deferred<NoteSaveResult>(); const persist = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(result("resumed")); const quote = vi.fn(); const context = vi.fn(); const remove = vi.fn(); const session = new NoteSession(initial, persist); session.edit({ content: "submitted" }); const saving = session.save(); await Promise.resolve(); session.edit({ content: "later human words", title: "later human title" }); pending.reject(new UnknownNoteWriteOutcome()); expect(await saving).toBe(false); session.tick(); expect(await session.save(true)).toBe(false); await expect(session.addQuote("later human words", quote, vi.fn())).rejects.toBeInstanceOf(UnknownNoteWriteOutcome); await expect(session.updateContext(context)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome); expect(await session.remove(remove)).toBe(false); expect(persist).toHaveBeenCalledTimes(1); expect(quote).not.toHaveBeenCalled(); expect(context).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(session.getSnapshot()).toMatchObject({ content: "later human words", title: "later human title", outcomeUnknown: true, retryRequired: true, saving: false, saved: { writeId: "w0" } });
  session.acceptBase({ content: "server words", title: "server title", hash: "server hash", writeId: "server write", revisionId: "server revision" }); session.tick(); expect(persist).toHaveBeenCalledTimes(1); expect(session.getSnapshot()).toMatchObject({ content: "later human words", title: "later human title", outcomeUnknown: false, retryRequired: true }); expect(await session.save()).toBe(true); expect(persist).toHaveBeenLastCalledWith({ content: "later human words", title: "later human title", baseHash: "server hash", baseWriteId: "server write" });
});
it("unknown quote never applies a quote transaction or releases protection through another operation", async () => {
  const persist = vi.fn(); const quote = vi.fn().mockRejectedValue(new UnknownNoteWriteOutcome()); const apply = vi.fn(); const session = new NoteSession(initial, persist); session.edit({ content: "human prose" }); await expect(session.addQuote("human prose", quote, apply)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome); expect(apply).not.toHaveBeenCalled(); await expect(session.addQuote("human prose", quote, apply)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome); session.tick(); expect(await session.save()).toBe(false); expect(quote).toHaveBeenCalledTimes(1); expect(persist).not.toHaveBeenCalled(); expect(session.getSnapshot()).toMatchObject({ content: "human prose", outcomeUnknown: true, retryRequired: true, saving: false, saved: { writeId: "w0" } });
});
it("a queued quote, context update and delete cannot run after the preceding write becomes unknown", async () => {
  const pending = deferred<NoteSaveResult>(); const persist = vi.fn().mockReturnValue(pending.promise); const quote = vi.fn(); const context = vi.fn(); const remove = vi.fn(); const session = new NoteSession(initial, persist); session.edit({ content: "human prose" }); const saving = session.save(); await Promise.resolve(); const quoting = session.addQuote("human prose", quote, vi.fn()); const linking = session.updateContext(context); const deleting = session.remove(remove); const settled = Promise.allSettled([saving, quoting, linking, deleting]); pending.reject(new UnknownNoteWriteOutcome()); expect((await settled).map(result => result.status)).toEqual(["fulfilled", "rejected", "rejected", "fulfilled"]); expect(persist).toHaveBeenCalledTimes(1); expect(quote).not.toHaveBeenCalled(); expect(context).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(session.getSnapshot()).toMatchObject({ content: "human prose", outcomeUnknown: true, saving: false });
});
it("an unknown forced save remains protected even when the human draft equals the previous baseline", async () => {
  const persist = vi.fn().mockRejectedValue(new UnknownNoteWriteOutcome()); const session = new NoteSession(initial, persist); expect(await session.save(true)).toBe(false); expect(session.getSnapshot()).toMatchObject({ dirty: false, outcomeUnknown: true, retryRequired: true, saving: false }); session.tick(); expect(await session.save(true)).toBe(false); expect(persist).toHaveBeenCalledTimes(1);
});
