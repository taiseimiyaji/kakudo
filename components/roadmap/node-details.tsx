import { Feedback } from "../common/feedback";
import { useState } from "react";
import type { z } from "zod";
import { nodePatch, nodeStatuses, type LearningNode } from "../../shared/roadmap";
export function NodeDetails({ node, busy, onSave, onDelete }: { node: LearningNode; busy: boolean; onSave: (data: z.infer<typeof nodePatch>) => Promise<void>; onDelete: () => Promise<void> }) {
  const [error, setError] = useState("");
  return <form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const lines = (name: string) => String(data.get(name)).split("\n").map((s) => s.trim()).filter(Boolean);
    const parsed = nodePatch.safeParse({ title: data.get("title"), description: data.get("description"), status: data.get("status"), learningObjectives: lines("objectives"), guidingQuestions: lines("questions"), positionX: Number(data.get("x")), positionY: Number(data.get("y")) });
    if (!parsed.success) { setError("入力内容を確認してください。目標・問いは各100項目以内、1項目2000文字以内です。"); return; }
    setError(""); void onSave(parsed.data);
  }}>
    <h2>Node Details</h2>
    {error && <Feedback error>{error}</Feedback>}
    <label>Node名<input name="title" defaultValue={node.title} required maxLength={200} /></label>
    <label>説明<textarea name="description" defaultValue={node.description} maxLength={10000} /></label>
    <label>学習状態<select name="status" defaultValue={node.status}>{nodeStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <label>Learning Objectives（1行1項目）<textarea name="objectives" defaultValue={node.learningObjectives.join("\n")} rows={5} /></label>
    <label>Guiding Questions（1行1項目）<textarea name="questions" defaultValue={node.guidingQuestions.join("\n")} rows={4} /></label>
    <div className="coordinates"><label>X<input name="x" type="number" step="any" min={-100000} max={100000} defaultValue={node.positionX} required /></label><label>Y<input name="y" type="number" step="any" min={-100000} max={100000} defaultValue={node.positionY} required /></label></div>
    <button disabled={busy}>Nodeを保存</button>
    <button className="danger" type="button" disabled={busy} onClick={() => { if (confirm("このNodeと接続を削除しますか？")) void onDelete(); }}>Nodeを削除</button>
    <p className="muted">Docs {node.stats.documents} / Sources {node.stats.sources} / Review ⚠ {node.stats.openFindings}</p><p className="muted">各Documentの直近の完了レビューを集計。Outdated: {node.stats.outdatedReviews}</p>
  </form>;
}
