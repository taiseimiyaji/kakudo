export type NoteDraft = { content: string; title: string };
export type NoteBase = NoteDraft & { hash: string; writeId: string | null };
export type NoteSaveResult = { contentHash: string; document: { currentRevisionId: string | null; lastWriteId: string | null } };
export type NoteState = NoteDraft & {
  saved: NoteBase;
  revisionId: string | null;
  dirty: boolean;
  saving: boolean;
  retryRequired: boolean;
  error: string;
  status: string;
};
type Persist = (draft: NoteDraft & { baseHash: string; baseWriteId: string | null }) => Promise<NoteSaveResult>;

/** One document's write queue. Server baselines never replace newer learner edits. */
export class NoteSession {
  private state: NoteState;
  private listeners = new Set<() => void>();
  private flight: Promise<boolean> | null = null;
  private holds = 0;
  private paused = false;
  private composing = false;
  private stopped = false;

  constructor(initial: NoteBase & { revisionId: string | null }, private persist: Persist) {
    const { content, title, hash, writeId, revisionId } = initial;
    this.state = { content, title, saved: { content, title, hash, writeId }, revisionId, dirty: false, saving: false, retryRequired: false, error: "", status: "" };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(change: Partial<NoteState>) {
    const next = { ...this.state, ...change };
    next.dirty = next.content !== next.saved.content || next.title !== next.saved.title;
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }
  edit(change: Partial<NoteDraft>) { this.update({ ...change, status: "" }); }
  setPaused(paused: boolean) { this.paused = paused; }
  setComposing(composing: boolean) { this.composing = composing; }
  tick() {
    if (this.paused || this.holds || this.composing || this.stopped || this.state.retryRequired || !this.state.dirty || !this.state.title.trim()) return;
    void this.save();
  }
  save(force = false): Promise<boolean> {
    if (this.flight) return this.flight;
    if (this.holds || this.stopped || this.composing || !this.state.title.trim()) return Promise.resolve(false);
    if (!this.state.dirty && !force) { this.update({ error: "", retryRequired: false, status: "保存しました" }); return Promise.resolve(true); }
    const snapshot = { content: this.state.content, title: this.state.title };
    const { hash: baseHash, writeId: baseWriteId } = this.state.saved;
    return this.write(async () => {
      const result = await this.persist({ ...snapshot, baseHash, baseWriteId });
      this.update({ saved: { ...snapshot, hash: result.contentHash, writeId: result.document.lastWriteId }, revisionId: result.document.currentRevisionId, retryRequired: false, status: this.state.content === snapshot.content && this.state.title === snapshot.title ? "保存しました" : "変更の一部を保存しました" });
    });
  }
  private write(work: () => Promise<void>): Promise<boolean> {
    this.update({ saving: true, error: "", status: "" });
    const flight = Promise.resolve().then(work).then(() => true).catch((error: unknown) => {
      this.update({ retryRequired: true, error: error instanceof Error ? error.message : "保存できませんでした" }); return false;
    }).finally(() => { this.flight = null; this.update({ saving: this.holds > 0 }); });
    this.flight = flight;
    return flight;
  }
  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    this.holds++; this.update({ saving: true });
    try {
      while (this.flight) {
        if (!await this.flight) throw new Error(this.state.error);
      }
      if (this.stopped) throw new Error("ノートを閉じています");
      let result!: T;
      const success = await this.write(async () => { result = await work(); });
      if (!success) throw new Error(this.state.error);
      return result;
    } finally { this.holds--; this.update({ saving: this.holds > 0 || !!this.flight }); }
  }
  async addQuote(contentAtPaste: string, writeQuote: (draft: NoteDraft & { baseHash: string; baseWriteId: string | null }) => Promise<NoteSaveResult & { content: string }>, applyQuote: (content: string) => void) {
    return this.exclusive(async () => {
      if (this.state.content !== contentAtPaste) throw new Error("引用操作中に本文が変わりました。引用を開き直してください。");
      const snapshot = { content: this.state.content, title: this.state.title };
      const { hash: baseHash, writeId: baseWriteId } = this.state.saved;
      const result = await writeQuote({ ...snapshot, baseHash, baseWriteId });
      // CodeMirror owns the quote transaction and preserves its existing Undo history.
      applyQuote(result.content);
      this.update({ content: result.content, saved: { content: result.content, title: snapshot.title, hash: result.contentHash, writeId: result.document.lastWriteId }, revisionId: result.document.currentRevisionId, retryRequired: false, status: "引用を追加して保存しました" });
      return result;
    });
  }
  async updateContext<T extends { document: { lastWriteId: string | null } }>(writeContext: (baseWriteId: string | null) => Promise<T>): Promise<T> {
    return this.exclusive(async () => {
      const result = await writeContext(this.state.saved.writeId);
      this.update({ saved: { ...this.state.saved, writeId: result.document.lastWriteId }, status: "関連を更新しました。本文は保持されています。" });
      return result;
    });
  }
  acceptBase(base: NoteBase & { revisionId: string | null }) {
    if (this.flight || this.holds || this.stopped) throw new Error("保存が完了してから確認してください。");
    const { revisionId, ...saved } = base;
    // Confirming a baseline never authorizes a timer to overwrite it automatically.
    this.update({ saved, revisionId, error: "", retryRequired: true, status: "最新の保存内容を確認しました。現在の入力で保存を再試行できます。" });
  }
  async remove(remove: () => Promise<void>): Promise<boolean> {
    this.stopped = true;
    while (this.flight) await this.flight;
    const success = await this.write(remove);
    if (!success) this.stopped = false;
    return success;
  }
}
