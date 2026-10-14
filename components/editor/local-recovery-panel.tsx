import type { NoteState } from "../../modules/editor/note-session";
import type { LocalCandidate } from "../../client/local-recovery";
import type { LocalRecoveryView } from "../../client/note-local-recovery";

export function LocalRecoveryPanel({ view, note, onEnable, onDisable, onRefresh, onRestore, onDiscard, canRestore, canUndoRestore, onUndoRestore }: {
  view: LocalRecoveryView;
  note: NoteState;
  onEnable: () => void;
  onDisable: () => void;
  onRefresh: () => void;
  onRestore: (candidate: LocalCandidate) => void;
  onDiscard: (candidate: LocalCandidate) => void;
  canRestore: boolean;
  canUndoRestore: boolean;
  onUndoRestore: () => void;
}) {
  const status = view.status === "stored" ? "端末に保存済み（サーバーとは別）" : view.status === "pending" ? "端末へ保存中…" : view.status === "error" ? "端末に保存できません" : view.enabled ? "端末下書きが有効" : "端末下書きは無効";
  return <section id="local-recovery" className="local-recovery" aria-label="端末内の下書き">
    <details>
      <summary>端末内の下書き</summary>
      <p>初期設定は無効です。有効にすると、このブラウザの端末内にノート名とMarkdown本文を平文で保存します。同じブラウザを使う人が読める可能性があります。サーバーやAIへ追加送信しません。</p>
      <p>最終編集から7日で、次にこのノートを開いた時に期限を確認します。候補は各2 MiB、このノート全体で20 MiBまで。ブラウザによる削除・容量不足・プライベート閲覧では復元できない場合があります。</p>
      <p role="status" aria-live="polite">{status}</p>
      {view.warning && <p role="alert" className="error">{view.warning}</p>}
      {view.enabled ? <button type="button" disabled={view.busy} onClick={onDisable}>無効にしてこのノートの端末下書きを削除</button> : <button type="button" disabled={view.busy} onClick={onEnable}>このノートの端末下書きを有効にする</button>}
      <button type="button" className="secondary" disabled={view.busy} onClick={onRefresh}>候補を再確認</button>
    </details>
    {view.enabled && view.status !== "idle" && <p className="muted" role="status">{status}</p>}
    {canUndoRestore && <button type="button" className="secondary" onClick={onUndoRestore}>復元前に戻す（本文と名前）</button>}
    {view.candidates.length > 0 && <div className="local-recovery-candidates"><h2>この端末の復元候補</h2><p>サーバーの保存版と確認し、復元する候補を選んでください。復元してもサーバーには書き込みません。保存は別の明示操作です。</p>
      {view.candidates.map((candidate) => <article key={candidate.key} className="local-recovery-candidate">
        <h3>{candidate.title.trim() ? candidate.title : "（名前が空または空白の下書き）"}</h3>
        <p>最終編集: <time dateTime={new Date(candidate.updatedAt).toISOString()}>{new Date(candidate.updatedAt).toLocaleString("ja-JP")}</time> / 編集セッション: {candidate.sessionId.slice(0, 8)}</p>
        {candidate.outcomeUnknown && <p>直前の保存・引用の結果は不明です。本文が一致しても引用の成否は確定しません。</p>}
        {candidate.baseHash !== note.saved.hash || candidate.baseWriteId !== note.saved.writeId ? <p>候補の保存基準よりサーバー版が変わっています。本文と名前を確認してください。</p> : null}
        <details><summary>サーバー版と候補の本文を比較</summary><div className="local-recovery-compare"><section><h4>現在のサーバー版: {note.saved.title}</h4><pre tabIndex={0}>{note.saved.content}</pre></section><section><h4>この端末の候補: {candidate.title}</h4><pre tabIndex={0}>{candidate.content}</pre></section></div></details>
        <button type="button" disabled={!canRestore || view.busy} onClick={() => onRestore(candidate)}>この候補を編集画面に復元</button>
        <button type="button" className="secondary" disabled={view.busy} onClick={() => onDiscard(candidate)}>この候補を破棄</button>
      </article>)}
      {!canRestore && !canUndoRestore && <p>現在の入力がある場合は、それを保存または控えてから復元してください。読込の遅延で新しい入力を上書きしません。</p>}
    </div>}
  </section>;
}
