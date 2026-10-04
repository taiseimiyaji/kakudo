import { label } from "../../client/labels";
import type { useReviewAdmission } from "../../client/hooks/use-review-admission";
import type { ReviewHistoryItem } from "../../client/review-admission";

export function ReviewAdmissionRecovery({ admission, onOpen }: { admission: ReturnType<typeof useReviewAdmission>; onOpen: (id: string, rows: ReviewHistoryItem[]) => void }) {
  const recovery = admission.recovery;
  if (!recovery) return null;
  return <section aria-label="レビューの受付結果の確認" aria-busy={recovery.reading}>
    <p role="alert">{label(recovery.attempt.type)}の受付結果は不明です。レビューが受け付けられた可能性があります。追加で開始する前に履歴を確認してください。</p>
    <p>対象の保存版: {recovery.attempt.revisionId}。本文・名前やほかの入力は保持しています。</p>
    <button className="secondary" disabled={recovery.reading} onClick={() => { void admission.read(); }}>受付済みのレビューを確認</button>
    {recovery.reading && <p role="status">履歴を確認しています…</p>}
    {recovery.error && <p role="alert">{recovery.error}</p>}
    {admission.candidates !== null && <>
      <p>受付前の履歴にはなかった、同じ保存版・種類の候補です。別の画面で開始された結果も含むため、同じ受付要求の結果とは限りません。候補がなくても先の受付が遅れて完了する可能性があります。</p>
      {!admission.candidates.length && <p>該当する候補は見つかりませんでした。受付結果はまだ不明です。</p>}
      <ul>{admission.candidates.map((run) => <li key={run.id}>{new Date(run.createdAt).toLocaleString()} · {label(run.status)} · {run.id.slice(0, 8)} <button className="secondary" disabled={recovery.reading} onClick={() => admission.open(run.id, onOpen)}>このレビューを確認</button></li>)}</ul>
      <button className="secondary" disabled={recovery.reading} onClick={() => { if (window.confirm("先の受付が完了している場合、レビューが重複します。新しいレビューの開始を可能にしますか？")) admission.allowNew(); }}>履歴を確認しました。新しく開始</button>
    </>}
  </section>;
}
