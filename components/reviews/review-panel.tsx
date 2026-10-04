import { label } from "../../client/labels";
import { Feedback } from "../common/feedback";
import { useEffect, useState } from "react";
import { request } from "../../client/api";
import type { ReviewDetail } from "../../shared/review";
import type { FindingSelection } from "../../modules/editor/review-highlight";
import { pollReview } from "../../modules/review/polling";
import { useReviewAdmission } from "../../client/hooks/use-review-admission";
import { ReviewAdmissionRecovery } from "./admission-recovery";
import { useFindingDecision } from "../../client/hooks/use-finding-decision";
import { FindingDecisionRecovery } from "./finding-decision-recovery";
import type { FindingDecisionTarget, FindingStatus } from "../../client/finding-decision";
type HistoryItem = { id: string; revisionId: string; type: string; status: string; createdAt: string };
export function ReviewPanel({ documentId, workspaceId, revisionId, dirty, content, onSelect, initialRunId, contextVersion = 0, onReviewProtectionChange }: { documentId: string; workspaceId: string; revisionId: string | null; dirty: boolean; content: string; onSelect: (finding: FindingSelection | null) => void; initialRunId?: string; contextVersion?: number; onReviewProtectionChange?: (value: boolean) => void }) {
  const suffix = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [detail, setDetail] = useState<ReviewDetail | null>(null); const [history, setHistory] = useState<HistoryItem[]>([]); const [historyVersion, setHistoryVersion] = useState(0);
  const [runId, setRunId] = useState<string | null>(null); const [error, setError] = useState(""); const [version, setVersion] = useState(0);
  const admission = useReviewAdmission(documentId, workspaceId); const decision = useFindingDecision(documentId, workspaceId); const busy = decision.busy || admission.busy;
  const protectedResult = admission.blocked || decision.blocked;
  useEffect(() => { onReviewProtectionChange?.(protectedResult); return () => onReviewProtectionChange?.(false); }, [onReviewProtectionChange, protectedResult]);
  const [pollError, setPollError] = useState("");
  const [historyError, setHistoryError] = useState(""); const [historyReady, setHistoryReady] = useState(false);
  useEffect(() => {
    setHistoryReady(false); setHistoryError("");
    return pollReview({
      load: () => request<{ reviews: HistoryItem[] }>(`/documents/${documentId}/reviews${suffix}`),
      onData: (data) => { setHistory(data.reviews); setHistoryReady(true); setHistoryError(""); setRunId((current) => current ?? (data.reviews.some((r) => r.id === initialRunId) ? initialRunId! : data.reviews[0]?.id ?? null)); },
      onError: (e) => setHistoryError(`レビュー履歴を取得できませんでした。${(e as Error).message} 自動で再試行します。`),
      pending: () => false,
    });
  }, [documentId, suffix, historyVersion, initialRunId]);
  useEffect(() => {
    setPollError("");
    if (!runId) return;
    return pollReview({ load: () => request<ReviewDetail>(`/reviews/${runId}${suffix}`),
      onData: (data) => { setDetail(data); setPollError(""); },
      onError: (e) => setPollError(`レビュー状態を取得できませんでした。${(e as Error).message} 自動で再試行します。`),
      pending: (data) => ["QUEUED", "RUNNING"].includes(data.run.status),
    });
  }, [runId, suffix, revisionId, version, contextVersion]);
  async function start(type: ReviewDetail["run"]["type"]) {
    if (!revisionId) return;
    await admission.start(revisionId, type, history.map((run) => run.id), { onStart: () => { setError(""); onSelect(null); }, onAccepted: (id) => { setRunId(id); setDetail(null); setHistoryVersion((v) => v + 1); }, onRejected: setError });
  }
  function reflectFindingStatus(target: FindingDecisionTarget, status: FindingStatus) {
    setDetail((current) => current?.run.id === target.runId && current.run.documentId === target.documentId && current.run.revisionId === target.revisionId ? { ...current, findings: current.findings.map((finding) => finding.id === target.findingId ? { ...finding, status } : finding) } : current);
    setVersion((v) => v + 1);
  }
  async function changeStatus(id: string, status: FindingStatus) {
    if (!detail) return;
    const finding = detail.findings.find((value) => value.id === id); if (!finding) return;
    await decision.change(detail.run.id, detail.run.revisionId, id, status, finding.targetText || finding.explanation, { onStart: () => setError(""), onConfirmed: reflectFindingStatus, onRejected: setError });
  }
  const running = busy || !historyReady || !!runId && !detail || !!detail && ["QUEUED", "RUNNING"].includes(detail.run.status);
  const stale = !!detail && (detail.stale || detail.run.revisionId !== revisionId || detail.revision.contentSnapshot !== content);
  return <section className="review-panel" aria-label="レビュー"><h2>理解を確かめる</h2><p className="muted">AIが問題点や根拠、考えるための問いを提示します。本文の修正は自分で行います。</p><div className="review-actions">
    {([ ["FULL", "全体を確認"], ["FACT_CHECK", "事実を確認"], ["SOURCE", "出典を確認"], ["LOGIC", "論理を確認"], ["COVERAGE", "学習目標を確認"] ] as const).map(([type, label]) => <button key={type} disabled={dirty || !revisionId || running || admission.blocked} onClick={() => { void start(type); }}>{label}</button>)}</div>
    <ReviewAdmissionRecovery admission={admission} onOpen={(id, rows) => { onSelect(null); setHistory(rows); setRunId(id); setDetail(null); setError(""); setHistoryVersion((v) => v + 1); setVersion((v) => v + 1); }} />
    <FindingDecisionRecovery decision={decision} onRead={reflectFindingStatus} />
    {(dirty || !revisionId) && <p>本文を保存してからレビューしてください。</p>}{error && <Feedback error>{error}</Feedback>}
    {historyError && <><Feedback error>{historyError}</Feedback><button onClick={() => setHistoryVersion((v) => v + 1)}>履歴を再取得</button></>}
    {pollError && <><Feedback error>{pollError}</Feedback><button onClick={() => setVersion((v) => v + 1)}>状態を再取得</button></>}
    {history.length > 0 && <label>レビュー履歴<select value={runId ?? ""} onChange={(e) => { onSelect(null); setDetail(null); setRunId(e.target.value); }}>{history.map((run) => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString()} · {label(run.type)} · {run.revisionId.slice(0, 8)}</option>)}</select></label>}
    {detail && <><p aria-label="レビューの状態">{label(detail.run.status)} / {label(detail.run.stage)}</p><p>確認方法: {detail.run.provider === "mock" ? "デモ（Mock：実AI・実資料取得ではありません）" : label(detail.run.provider)}</p><small>対象の保存版: {detail.run.revisionId}</small>
      {detail.run.error && <p role="alert">{detail.run.error}</p>}
      {stale && <div className="stale-review"><p>更新前のレビュー — {detail.objectivesChanged ? "学習目標が変更されています。" : "このレビュー後にノートが変更されています。"}</p><button disabled={dirty || !revisionId || running || admission.blocked} onClick={() => { void start(detail.run.type); }}>もう一度レビュー</button><p>過去の結果です。本文のハイライトは無効です。</p></div>}
      {detail.run.status === "COMPLETED" && !detail.findings.length && !(detail.run.type === "COVERAGE" && !detail.run.objectives.length) && <p>指摘はありません（正確性や理解の保証ではありません）。</p>}
      {["COVERAGE", "FULL"].includes(detail.run.type) && !detail.run.objectives.length && <p>学習目標が未設定です。学習目標との対応は評価していません。学習項目に自分で目標を設定してください。</p>}
      {detail.run.coverage.length > 0 && <section aria-label="学習目標の確認結果"><h3>学習目標の確認結果</h3><p>関連する全学習項目の、レビュー開始時の学習目標を評価しています。</p>{detail.run.coverage.map((result) => {
        const objective = detail.run.objectives.find((o) => o.id === result.objectiveId);
        return <div className="coverage-result" key={result.objectiveId}><strong>{objective?.nodeTitle ? `${objective.nodeTitle}: ` : ""}{objective?.text}</strong><span>{({ COVERED: "✓ 説明できています", PARTIALLY_COVERED: "△ 説明が一部不足しています", NOT_COVERED: "○ まだ説明がありません" } as Record<string, string>)[result.status]}</span><p>{result.explanation}</p>{result.guidingQuestion && <p>考えるヒント: {result.guidingQuestion}</p>}</div>;
      })}</section>}
      {detail.findings.map((finding) => <article key={finding.id} aria-label={`${label(finding.category)}の指摘`} data-status={finding.status}><header><h3>{label(finding.category)} · {label(finding.severity)}</h3><span>{label(finding.status)}</span></header>
        {finding.targetText && <blockquote>{finding.targetText}</blockquote>}<p>{finding.explanation}</p>{finding.verdict && <small>{label(finding.verdict)}</small>}{finding.guidingQuestion && <p>考えるヒント: {finding.guidingQuestion}</p>}
        <ul>{finding.evidence.map((e) => <li key={e.id}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a><small> · {label(e.sourceType)} · {new Date(e.accessedAt).toLocaleDateString()}</small>{e.excerpt && <details><summary>取得資料の抜粋</summary><blockquote>{e.excerpt}</blockquote></details>}</li>)}</ul>
        {finding.targetText && <button className="secondary" disabled={stale} onClick={() => onSelect({ revisionId: detail.run.revisionId, snapshot: detail.revision.contentSnapshot, startOffset: finding.startOffset, endOffset: finding.endOffset, targetText: finding.targetText })}>本文で確認</button>}
        <button disabled={busy || decision.blocked || finding.status === "RESOLVED"} onClick={() => { void changeStatus(finding.id, "RESOLVED"); }}>解決済みにする</button><button className="secondary" disabled={busy || decision.blocked || finding.status === "DISMISSED"} onClick={() => { void changeStatus(finding.id, "DISMISSED"); }}>見送る</button>
        {finding.status !== "OPEN" && <button className="secondary" disabled={busy || decision.blocked} onClick={() => { void changeStatus(finding.id, "OPEN"); }}>未対応に戻す</button>}
      </article>)}
      {detail.run.sourceChecks.map((check) => <p key={check.quoteId}>{label(check.status)}: <a href={check.url} target="_blank" rel="noreferrer">{check.title}</a></p>)}
      {detail.run.notices.length > 0 && <details><summary>確認できなかった情報・探索範囲</summary><ul>{detail.run.notices.map((notice, i) => <li key={i}>{notice}</li>)}</ul></details>}
    </>}
  </section>;
}
