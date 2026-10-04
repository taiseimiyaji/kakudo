import { label } from "../../client/labels";
import type { useGraphSaveRecovery } from "../../client/hooks/use-graph-save-recovery";

export function GraphSaveRecovery({ recovery, onRead }: { recovery: ReturnType<typeof useGraphSaveRecovery>; onRead: () => void }) {
  const state = recovery.recovery; if (!state) return null;
  const target = state.attempt.target; const name = target.kind === "map" ? "マップ" : "学習項目";
  return <section aria-label="マップ・項目の保存結果の確認" aria-busy={state.reading}>
    <p role="alert">{name}「{target.name}」の保存結果は不明です。保存された可能性があります。新たに保存する前に現在の保存済み内容を確認してください。</p>
    <p>編集中の入力・資料・次の項目名は保持しています。</p>
    <button className="secondary" disabled={state.reading} onClick={onRead}>現在の保存済み内容を確認</button>
    {state.reading && <p role="status">保存済み内容を確認しています…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.current !== null && <>
      <section aria-label="確認した保存済み内容"><h3>確認した保存済み内容</h3><p>名前: {state.current.saved.title}</p><p>説明: {state.current.saved.description || "未設定"}</p>
        {state.current.kind === "node" && <><p>学習状態: {label(state.current.saved.status)}</p><p>学習目標: {state.current.saved.learningObjectives.join(" / ") || "未設定"}</p><p>考えるための問い: {state.current.saved.guidingQuestions.join(" / ") || "未設定"}</p></>}
      </section>
      <p>現在の内容には別の画面の変更も含まれます。入力と同じ内容でも、先の保存要求の完了を証明するものではありません。先の保存が遅れて反映される可能性があります。編集中の入力はこの確認では変更しません。</p>
      <button className="secondary" disabled={state.reading} onClick={() => { if (window.confirm("先の保存が遅れて反映され、次の変更を上書きする可能性があります。新たな保存は別画面の変更も上書きし得ます。保存を再開しますか？")) recovery.allowNew(); }}>保存済み内容を確認しました。保存を再開</button>
    </>}
  </section>;
}
