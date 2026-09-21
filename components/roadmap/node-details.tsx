import { useState } from "react";
import type { useFormDraft } from "../../client/hooks/use-form-draft";
import type { z } from "zod";
import { nodePatch, nodeStatuses, type LearningNode } from "../../shared/roadmap";
export function nodeFormValues(node?: LearningNode) {
  return { title: node?.title ?? "", description: node?.description ?? "", status: node?.status ?? "NOT_STARTED", objectives: node?.learningObjectives.join("\n") ?? "", questions: node?.guidingQuestions.join("\n") ?? "", x: String(node?.positionX ?? 0), y: String(node?.positionY ?? 0) };
}
export function NodeDetails({ node, busy, draft, onSave, onDelete }: { node: LearningNode; busy: boolean; draft: ReturnType<typeof useFormDraft<ReturnType<typeof nodeFormValues>>>; onSave: (data: z.infer<typeof nodePatch>) => Promise<boolean>; onDelete: () => Promise<boolean> }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const field = (name: keyof typeof draft.values) => ({ value: draft.values[name], disabled: busy, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { draft.change(name, event.target.value); setStatus(""); } });
  return <form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const lines = (name: string) => String(data.get(name)).split("\n").map((s) => s.trim()).filter(Boolean);
    const parsed = nodePatch.safeParse({ title: data.get("title"), description: data.get("description"), status: data.get("status"), learningObjectives: lines("objectives"), guidingQuestions: lines("questions"), positionX: Number(data.get("x")), positionY: Number(data.get("y")) });
    if (!parsed.success) { setError("入力内容を確認してください。目標・問いは各100項目以内、1項目2000文字以内です。"); return; }
    setError(""); setStatus("保存中…"); void onSave(parsed.data).then((saved) => { setStatus(saved ? "保存しました" : "保存に失敗しました。入力を保持しています。再試行してください。"); });
  }}>
    <h2>Node Details</h2>
    <p role="status">{status || (draft.dirty ? "未保存の変更" : "保存済み")}</p>
    {error && <p role="alert">{error}</p>}
    <label>Node名<input name="title" {...field("title")} required maxLength={200} /></label>
    <label>説明<textarea name="description" {...field("description")} maxLength={10000} /></label>
    <label>学習状態<select name="status" {...field("status")}>{nodeStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <label>Learning Objectives（1行1項目）<textarea name="objectives" {...field("objectives")} rows={5} /></label>
    <label>Guiding Questions（1行1項目）<textarea name="questions" {...field("questions")} rows={4} /></label>
    <div className="coordinates"><label>X<input name="x" type="number" step="any" min={-100000} max={100000} {...field("x")} required /></label><label>Y<input name="y" type="number" step="any" min={-100000} max={100000} {...field("y")} required /></label></div>
    <button disabled={busy}>Nodeを保存</button>
    <button className="danger" type="button" disabled={busy} onClick={() => { if (confirm("このNodeと接続を削除しますか？")) void onDelete(); }}>Nodeを削除</button>
    <p className="muted">Docs {node.stats.documents} / Sources {node.stats.sources} / Review ⚠ {node.stats.openFindings}</p><p className="muted">各Documentの直近の完了レビューを集計。Outdated: {node.stats.outdatedReviews}</p>
  </form>;
}
