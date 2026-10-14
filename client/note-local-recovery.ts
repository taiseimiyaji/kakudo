import type { NoteDraft, NoteState } from "../modules/editor/note-session";
import { acknowledgeLocalSave, disableLocalRecovery, discardLocalCandidate, enableLocalRecovery, loadLocalRecovery, localCandidateKey, localDocumentKey, LocalRecoveryError, putLocalCandidate, type LocalCandidate } from "./local-recovery";

export type LocalRecoveryView = {
  enabled: boolean;
  busy: boolean;
  candidates: LocalCandidate[];
  status: "off" | "idle" | "pending" | "stored" | "error";
  warning: string;
};
const initial: LocalRecoveryView = { enabled: false, busy: true, candidates: [], status: "off", warning: "" };
function errorMessage(error: unknown) {
  if (error instanceof LocalRecoveryError && error.kind === "limit") return "端末下書きの容量上限に達しました。以前の候補は消していません。現在の入力を別の場所へ控えてください。";
  if (error instanceof LocalRecoveryError && error.kind === "quota") return "ブラウザの保存容量が不足しています。現在の入力は端末に保存できませんでした。";
  return "このブラウザでは端末下書きを読み書きできません。現在の入力を別の場所へ控えてください。";
}
/** UI state and local snapshots only; NoteSession remains the sole server write queue. */
export class NoteLocalRecovery {
  readonly documentKey: string;
  readonly sessionId = crypto.randomUUID();
  private state: LocalRecoveryView = initial;
  private listeners = new Set<() => void>();
  private epoch = 0;
  private generation = 0;
  private lastHumanEdit = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest: LocalCandidate | null = null;
  private operation = 0;
  private closed = false;
  private restored: LocalCandidate | null = null;
  private channel: BroadcastChannel | null = null;

  constructor(workspaceId: string, documentId: string) { this.documentKey = localDocumentKey(workspaceId, documentId); }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(change: Partial<LocalRecoveryView>) { this.state = { ...this.state, ...change }; this.listeners.forEach((listener) => listener()); }
  async activate(getNote: () => NoteState) {
    this.closed = false;
    if (!this.channel && typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel("kakudo:local-recovery");
      this.channel.onmessage = (event) => { if (event.data?.documentKey === this.documentKey && !this.state.busy) void this.refresh(); };
    }
    const operation = ++this.operation;
    try {
      const result = await loadLocalRecovery(this.documentKey);
      if (this.closed || operation !== this.operation) return;
      this.epoch = result.epoch;
      this.update({ busy: false, enabled: result.enabled, candidates: result.candidates, status: result.enabled ? "idle" : "off", warning: result.warning ? "読めない形式の端末下書きがあります。自動的に上書き・削除しません。" : "" });
      const note = getNote();
      if (result.enabled && (this.generation > 0 || note.dirty || note.outcomeUnknown)) this.capture(note, false);
    } catch (error) {
      if (!this.closed && operation === this.operation) this.update({ busy: false, enabled: false, status: "error", warning: errorMessage(error) });
    }
  }
  close() { this.closed = true; this.operation++; if (this.timer) clearTimeout(this.timer); this.timer = null; this.channel?.close(); this.channel = null; }
  private announce() { this.channel?.postMessage({ documentKey: this.documentKey }); }
  private capture(note: NoteState, human: boolean) {
    this.generation++;
    if (human) this.lastHumanEdit = Date.now();
    if (!this.state.enabled) return;
    const candidate: LocalCandidate = {
      version: 1, key: localCandidateKey(this.documentKey, this.sessionId), documentKey: this.documentKey, sessionId: this.sessionId,
      generation: this.generation, title: note.title, content: note.content, baseHash: note.saved.hash,
      baseWriteId: note.saved.writeId, outcomeUnknown: note.outcomeUnknown,
      updatedAt: this.lastHumanEdit || Date.now(),
    };
    this.latest = candidate;
    if (this.timer) clearTimeout(this.timer);
    this.update({ status: "pending", warning: "" });
    this.timer = setTimeout(() => { this.timer = null; void this.flush(candidate, this.epoch); }, 150);
  }
  onHumanEdit(note: NoteState) { this.capture(note, true); }
  onUnknownOutcome(note: NoteState) { if (this.state.enabled) this.capture(note, false); }
  private async flush(candidate: LocalCandidate, epoch: number) {
    try {
      const result = await putLocalCandidate(candidate, epoch);
      if (this.closed || !this.state.enabled || this.epoch !== epoch || candidate.generation !== this.generation) return;
      if (result === "disabled") { this.update({ enabled: false, status: "error", warning: "別のタブで端末下書きが無効になりました。現在の入力はこの画面だけに残っています。" }); return; }
      if (result === "corrupt") { this.update({ status: "error", warning: "読めない形式の端末下書きがあります。候補を上書きせず、現在の入力も端末に保存できませんでした。" }); return; }
      if (result === "stored") {
        const candidates = [candidate, ...this.state.candidates.filter((item) => item.key !== candidate.key)].sort((a, b) => b.updatedAt - a.updatedAt);
        this.update({ candidates, status: "stored" });
        this.announce();
      }
    } catch (error) {
      if (!this.closed && this.state.enabled && this.epoch === epoch && candidate.generation === this.generation) this.update({ status: "error", warning: errorMessage(error) });
    }
  }
  async enable(getNote: () => NoteState) {
    const operation = ++this.operation;
    this.update({ busy: true });
    try {
      const epoch = await enableLocalRecovery(this.documentKey);
      if (this.closed || operation !== this.operation) return;
      this.epoch = epoch;
      this.update({ busy: false, enabled: true, status: "idle", warning: "" });
      this.announce();
      const note = getNote();
      if (note.dirty || note.outcomeUnknown) this.capture(note, false);
    } catch (error) { if (!this.closed && operation === this.operation) this.update({ busy: false, status: "error", warning: errorMessage(error) }); }
  }
  async disable(): Promise<boolean> {
    const operation = ++this.operation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.update({ busy: true, status: "pending" });
    try {
      await disableLocalRecovery(this.documentKey);
      if (this.closed || operation !== this.operation) return true;
      this.epoch++;
      this.latest = null;
      this.update({ busy: false, enabled: false, candidates: [], status: "off", warning: "" });
      this.announce();
      return true;
    } catch (error) { if (!this.closed && operation === this.operation) this.update({ busy: false, status: "error", warning: errorMessage(error) }); return false; }
  }
  async refresh() {
    const operation = ++this.operation;
    try {
      const result = await loadLocalRecovery(this.documentKey);
      if (this.closed || operation !== this.operation) return;
      this.epoch = result.epoch;
      const ownCurrent = result.candidates.some((item) => item.sessionId === this.sessionId && item.generation === this.generation);
      const failedCurrent = this.state.status === "error" && !!this.latest && !ownCurrent;
      this.update({ enabled: result.enabled, candidates: result.candidates, status: !result.enabled ? "off" : this.state.status === "pending" ? "pending" : ownCurrent ? "stored" : failedCurrent ? "error" : "idle",
        warning: result.warning ? "読めない形式の端末下書きがあります。自動的に上書き・削除しません。" : failedCurrent ? this.state.warning : "" });
    } catch (error) { if (!this.closed && operation === this.operation) this.update({ status: "error", warning: errorMessage(error) }); }
  }
  async discard(candidate: LocalCandidate) {
    try {
      await discardLocalCandidate(candidate);
      if (!this.closed) {
        const candidates = this.state.candidates.filter((item) => item.key !== candidate.key || item.generation > candidate.generation);
        const ownCurrent = candidates.some((item) => item.sessionId === this.sessionId && item.generation === this.generation);
        const status = this.state.status === "stored" && !ownCurrent ? "idle" : this.state.status;
        this.update({ candidates, status }); this.announce();
      }
    } catch (error) { if (!this.closed) this.update({ status: "error", warning: errorMessage(error) }); }
  }
  markRestored(candidate: LocalCandidate) { this.restored = candidate; }
  clearRestored() { this.restored = null; }
  generationFor(draft: NoteDraft) { return this.latest?.title === draft.title && this.latest.content === draft.content ? this.latest.generation : 0; }
  confirmed(_draft: NoteDraft, generation: number) {
    if (generation) {
      if (this.timer && this.latest && this.latest.generation <= generation) { clearTimeout(this.timer); this.timer = null; }
      void acknowledgeLocalSave(this.documentKey, this.sessionId, generation).then(() => {
        if (!this.closed) { this.update({ candidates: this.state.candidates.filter((item) => item.sessionId !== this.sessionId || item.generation > generation), status: this.generation > generation ? this.state.status : "idle" }); this.announce(); }
      }).catch((error) => { if (!this.closed) this.update({ status: "error", warning: errorMessage(error) }); });
    }
    if (this.restored) { const candidate = this.restored; this.restored = null; void this.discard(candidate); }
  }
}
