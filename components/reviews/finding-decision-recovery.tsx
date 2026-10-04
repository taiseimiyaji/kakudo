import { label } from "../../client/labels";
import type { useFindingDecision } from "../../client/hooks/use-finding-decision";
import type { FindingDecisionTarget, FindingStatus } from "../../client/finding-decision";

export function FindingDecisionRecovery({ decision, onRead }: { decision: ReturnType<typeof useFindingDecision>; onRead: (target: FindingDecisionTarget, status: FindingStatus) => void }) {
  const recovery = decision.recovery;
  if (!recovery) return null;
  return <section aria-label="指摘の更新結果の確認" aria-busy={recovery.reading}>
    <p role="alert">「{label(recovery.attempt.status)}」への更新結果は不明です。保存された可能性があります。新しい判断をする前に現在の状態を確認してください。</p>
    <p>更新しようとした指摘:</p><blockquote>{recovery.attempt.description}</blockquote>
    <small>対象の保存版: {recovery.attempt.revisionId}</small><p>本文・名前やほかの入力は保持しています。</p>
    <button className="secondary" disabled={recovery.reading} onClick={() => { void decision.read(onRead); }}>指摘の現在状態を確認</button>
    {recovery.reading && <p role="status">指摘の現在状態を確認しています…</p>}
    {recovery.error && <p role="alert">{recovery.error}</p>}
    {recovery.currentStatus !== null && <>
      <p>確認した現在の状態: {label(recovery.currentStatus)}。別の画面の変更も含むため、先の更新要求の完了を証明するものではありません。先の更新が遅れて反映される可能性があります。</p>
      <button className="secondary" disabled={recovery.reading} onClick={() => { if (window.confirm("先の更新が遅れて反映され、次の判断を書き換える可能性があります。新しい判断を可能にしますか？")) decision.allowNew(); }}>現在の状態を確認しました。判断を続ける</button>
    </>}
  </section>;
}
