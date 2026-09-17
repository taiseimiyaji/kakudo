import { useEffect, useState } from "react";
import { request } from "../../client/api";
import type { ReviewDetail } from "../../shared/review";
export function ReviewPanel({ documentId, workspaceId, revisionId, dirty }: { documentId: string; workspaceId: string; revisionId: string | null; dirty: boolean }) {
  const suffix = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [detail, setDetail] = useState<ReviewDetail | null>(null); const [runId, setRunId] = useState<string | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; request<{ reviews: { id: string }[] }>(`/documents/${documentId}/reviews${suffix}`).then((data) => { if (active && data.reviews[0]) setRunId(data.reviews[0].id); }).catch((e) => { if (active) setError(e.message); }); return () => { active = false; }; }, [documentId, suffix]);
  useEffect(() => {
    if (!runId) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const load = async () => { try { const data = await request<ReviewDetail>(`/reviews/${runId}${suffix}`); if (!active) return; setDetail(data); if (["QUEUED", "RUNNING"].includes(data.run.status)) timer = setTimeout(() => { void load(); }, 1000); } catch (e) { if (active) setError((e as Error).message); } };
    void load(); return () => { active = false; clearTimeout(timer); };
  }, [runId, suffix, revisionId]);
  async function start(type: "FULL" | "FACT_CHECK" | "SOURCE") {
    setBusy(true); setError("");
    try { const data = await request<{ run: { id: string } }>(`/documents/${documentId}/reviews${suffix}`, "POST", { type, revisionId }); setRunId(data.run.id); setDetail(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const running = busy || !!detail && ["QUEUED", "RUNNING"].includes(detail.run.status);
  return <section className="review-panel" aria-label="Reviews"><h2>Reviews</h2>
    {([ ["FULL", "Review"], ["FACT_CHECK", "Check Facts"], ["SOURCE", "Check Sources"] ] as const).map(([type, label]) => <button key={type} disabled={dirty || !revisionId || running} onClick={() => { void start(type); }}>{label}</button>)}
    {(dirty || !revisionId) && <p>本文を保存してからReviewしてください。</p>}{error && <p role="alert">{error}</p>}
    {detail && <><p aria-label="Review Status">{detail.run.status} / {detail.run.stage}</p><p>Provider: {detail.run.provider === "mock" ? "Mock（実AI・実資料取得ではありません）" : detail.run.provider}</p><small>対象Revision: {detail.run.revisionId}</small>
      {detail.run.error && <p role="alert">{detail.run.error}</p>}
      {(detail.stale || dirty || detail.run.revisionId !== revisionId) && <p className="error">Outdated Review — このレビュー後にDocumentが変更されています。</p>}
      {detail.run.status === "COMPLETED" && !detail.findings.length && <p>指摘はありません（正確性や理解の保証ではありません）。</p>}
      {detail.findings.map((finding) => <article key={finding.id}><h3>{finding.category} · {finding.severity}</h3>{finding.targetText && <blockquote>{finding.targetText}</blockquote>}<p>{finding.explanation}</p>{finding.verdict && <small>{finding.verdict}</small>}{finding.guidingQuestion && <p>Think about: {finding.guidingQuestion}</p>}<ul>{finding.evidence.map((e) => <li key={e.id}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a></li>)}</ul></article>)}
      {detail.run.sourceChecks.map((check) => <p key={check.quoteId}>{check.status}: <a href={check.url} target="_blank" rel="noreferrer">{check.title}</a></p>)}
      {detail.run.notices.length > 0 && <details><summary>確認できなかった情報・探索範囲</summary><ul>{detail.run.notices.map((notice, i) => <li key={i}>{notice}</li>)}</ul></details>}
    </>}
  </section>;
}
