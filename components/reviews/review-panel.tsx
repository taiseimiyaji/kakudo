import { Feedback } from "../common/feedback";
import { useEffect, useState } from "react";
import { request } from "../../client/api";
import type { ReviewDetail } from "../../shared/review";
import type { FindingSelection } from "../../modules/editor/review-highlight";
type HistoryItem = { id: string; revisionId: string; type: string; status: string; createdAt: string };
export function ReviewPanel({ documentId, workspaceId, revisionId, dirty, content, onSelect, initialRunId }: { documentId: string; workspaceId: string; revisionId: string | null; dirty: boolean; content: string; onSelect: (finding: FindingSelection | null) => void; initialRunId?: string }) {
  const suffix = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [detail, setDetail] = useState<ReviewDetail | null>(null); const [history, setHistory] = useState<HistoryItem[]>([]); const [historyVersion, setHistoryVersion] = useState(0);
  const [runId, setRunId] = useState<string | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [version, setVersion] = useState(0);
  useEffect(() => { let active = true; request<{ reviews: HistoryItem[] }>(`/documents/${documentId}/reviews${suffix}`).then((data) => { if (active) { setHistory(data.reviews); setRunId((current) => current ?? (data.reviews.some((r) => r.id === initialRunId) ? initialRunId! : data.reviews[0]?.id ?? null)); } }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [documentId, suffix, historyVersion, initialRunId]);
  useEffect(() => {
    if (!runId) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const load = async () => { try { const data = await request<ReviewDetail>(`/reviews/${runId}${suffix}`); if (!active) return; setDetail(data); if (["QUEUED", "RUNNING"].includes(data.run.status)) timer = setTimeout(() => { void load(); }, 1000); } catch (e) { if (active) setError((e as Error).message); } };
    void load(); return () => { active = false; clearTimeout(timer); };
  }, [runId, suffix, revisionId, version]);
  async function start(type: ReviewDetail["run"]["type"]) {
    setBusy(true); setError(""); onSelect(null);
    try { const data = await request<{ run: { id: string } }>(`/documents/${documentId}/reviews${suffix}`, "POST", { type, revisionId }); setRunId(data.run.id); setDetail(null); setHistoryVersion((v) => v + 1); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function changeStatus(id: string, status: "OPEN" | "RESOLVED" | "DISMISSED") {
    setBusy(true); setError("");
    try { await request(`/findings/${id}${suffix}`, "PATCH", { status }); setVersion((v) => v + 1); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const running = busy || !!detail && ["QUEUED", "RUNNING"].includes(detail.run.status);
  const stale = !!detail && (detail.stale || detail.run.revisionId !== revisionId || detail.revision.contentSnapshot !== content);
  return <section className="review-panel" aria-label="Reviews"><h2>Reviews</h2>
    {([ ["FULL", "Review"], ["FACT_CHECK", "Check Facts"], ["SOURCE", "Check Sources"], ["LOGIC", "Check Logic"], ["COVERAGE", "Check Coverage"] ] as const).map(([type, label]) => <button key={type} disabled={dirty || !revisionId || running} onClick={() => { void start(type); }}>{label}</button>)}
    {(dirty || !revisionId) && <p>本文を保存してからReviewしてください。</p>}{error && <Feedback error>{error}</Feedback>}
    {history.length > 0 && <label>Review履歴<select value={runId ?? ""} onChange={(e) => { onSelect(null); setDetail(null); setRunId(e.target.value); }}>{history.map((run) => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString()} · {run.type} · {run.revisionId.slice(0, 8)}</option>)}</select></label>}
    {detail && <><p aria-label="Review Status">{detail.run.status} / {detail.run.stage}</p><p>Provider: {detail.run.provider === "mock" ? "Mock（実AI・実資料取得ではありません）" : detail.run.provider}</p><small>対象Revision: {detail.run.revisionId}</small>
      {detail.run.error && <p role="alert">{detail.run.error}</p>}
      {stale && <div className="stale-review"><p>Outdated Review — {detail.objectivesChanged ? "Learning Objectivesが変更されています。" : "このレビュー後にDocumentが変更されています。"}</p><button disabled={dirty || !revisionId || running} onClick={() => { void start(detail.run.type); }}>Review Again</button><p>過去の結果です。本文のハイライトは無効です。</p></div>}
      {detail.run.status === "COMPLETED" && !detail.findings.length && !(detail.run.type === "COVERAGE" && !detail.run.objectives.length) && <p>指摘はありません（正確性や理解の保証ではありません）。</p>}
      {["COVERAGE", "FULL"].includes(detail.run.type) && !detail.run.objectives.length && <p>Learning Objectivesが未設定です。Coverageは評価していません。Nodeに自分で目標を設定してください。</p>}
      {detail.run.coverage.length > 0 && <section aria-label="Coverage Results"><h3>Learning Objective Coverage</h3><p>関連する全Nodeの、レビュー開始時のObjectivesを評価しています。</p>{detail.run.coverage.map((result) => {
        const objective = detail.run.objectives.find((o) => o.id === result.objectiveId);
        return <div className="coverage-result" key={result.objectiveId}><strong>{objective?.nodeTitle ? `${objective.nodeTitle}: ` : ""}{objective?.text}</strong><span>{({ COVERED: "✓ Covered", PARTIALLY_COVERED: "△ Partially Covered", NOT_COVERED: "○ Not Covered" } as Record<string, string>)[result.status]}</span><p>{result.explanation}</p>{result.guidingQuestion && <p>Think about: {result.guidingQuestion}</p>}</div>;
      })}</section>}
      {detail.findings.map((finding) => <article key={finding.id} aria-label={`${finding.category} Finding`} data-status={finding.status}><header><h3>{finding.category} · {finding.severity}</h3><span>{finding.status}</span></header>
        {finding.targetText && <blockquote>{finding.targetText}</blockquote>}<p>{finding.explanation}</p>{finding.verdict && <small>{finding.verdict}</small>}{finding.guidingQuestion && <p>Think about: {finding.guidingQuestion}</p>}
        <ul>{finding.evidence.map((e) => <li key={e.id}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a><small> · {e.sourceType} · {new Date(e.accessedAt).toLocaleDateString()}</small>{e.excerpt && <details><summary>取得資料の抜粋</summary><blockquote>{e.excerpt}</blockquote></details>}</li>)}</ul>
        {finding.targetText && <button className="secondary" disabled={stale} onClick={() => onSelect({ revisionId: detail.run.revisionId, snapshot: detail.revision.contentSnapshot, startOffset: finding.startOffset, endOffset: finding.endOffset, targetText: finding.targetText })}>本文で確認</button>}
        <button disabled={busy || finding.status === "RESOLVED"} onClick={() => { void changeStatus(finding.id, "RESOLVED"); }}>Resolve</button><button className="secondary" disabled={busy || finding.status === "DISMISSED"} onClick={() => { void changeStatus(finding.id, "DISMISSED"); }}>Dismiss</button>
        {finding.status !== "OPEN" && <button className="secondary" disabled={busy} onClick={() => { void changeStatus(finding.id, "OPEN"); }}>Reopen</button>}
      </article>)}
      {detail.run.sourceChecks.map((check) => <p key={check.quoteId}>{check.status}: <a href={check.url} target="_blank" rel="noreferrer">{check.title}</a></p>)}
      {detail.run.notices.length > 0 && <details><summary>確認できなかった情報・探索範囲</summary><ul>{detail.run.notices.map((notice, i) => <li key={i}>{notice}</li>)}</ul></details>}
    </>}
  </section>;
}
