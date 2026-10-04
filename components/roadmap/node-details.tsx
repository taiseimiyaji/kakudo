import { label } from "../../client/labels";
import { Feedback } from "../common/feedback";
import { useState } from "react";
import type { useFormDraft } from "../../client/hooks/use-form-draft";
import type { z } from "zod";
import { nodePatch, nodeStatuses, type LearningNode } from "../../shared/roadmap";
import type { GraphSaveOutcome } from "../../client/graph-save";
export function nodeFormValues(node?: LearningNode) {
  return { title: node?.title ?? "", description: node?.description ?? "", status: node?.status ?? "NOT_STARTED", objectives: node?.learningObjectives.join("\n") ?? "", questions: node?.guidingQuestions.join("\n") ?? "", x: String(node?.positionX ?? 0), y: String(node?.positionY ?? 0) };
}
export function NodeDetails({ node, busy, draft, onSave, onDelete, saveBlocked = false, canSave = () => true }: { node: LearningNode; busy: boolean; draft: ReturnType<typeof useFormDraft<ReturnType<typeof nodeFormValues>>>; onSave: (data: z.infer<typeof nodePatch>) => Promise<GraphSaveOutcome>; onDelete: () => Promise<boolean>; saveBlocked?: boolean; canSave?: () => boolean }) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const field = (name: keyof typeof draft.values) => ({ value: draft.values[name], disabled: busy, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { draft.change(name, event.target.value); setStatus(""); } });
  return <form onSubmit={(event) => {
    event.preventDefault(); if (busy || saveBlocked || !canSave()) return; const data = new FormData(event.currentTarget);
    const lines = (name: string) => String(data.get(name)).split("\n").map((s) => s.trim()).filter(Boolean);
    const parsed = nodePatch.safeParse({ title: data.get("title"), description: data.get("description"), status: data.get("status"), learningObjectives: lines("objectives"), guidingQuestions: lines("questions"), positionX: Number(data.get("x")), positionY: Number(data.get("y")) });
    if (!parsed.success) { setError("入力内容を確認してください。目標・問いは各100項目以内、1項目2000文字以内です。"); return; }
    setError(""); setStatus("保存中…"); void onSave(parsed.data).then((saved) => { setStatus(saved === "unknown" ? "unknown" : saved ? "保存しました" : "保存に失敗しました。入力を保持しています。再試行してください。"); });
  }}>
    <h2>学習項目の詳細</h2>
    <Feedback>{status === "unknown" ? saveBlocked ? "保存結果は不明です。現在の保存済み内容を確認してください。" : "前の保存結果は不明です。次に保存すると新たな保存要求を送ります。" : status || (draft.dirty ? "未保存の変更" : "保存済み")}</Feedback>
    {error && <Feedback error>{error}</Feedback>}
    <label>学習項目名（必須）<input name="title" {...field("title")} required maxLength={200} /></label>
    <label>説明（任意）<textarea name="description" {...field("description")} maxLength={10000} /></label>
    <label>学習状態<select name="status" {...field("status")}>{nodeStatuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
    <label>学習目標（任意・1行1項目）<textarea name="objectives" {...field("objectives")} rows={5} /></label>
    <label>考えるための問い（任意・1行1項目）<textarea name="questions" {...field("questions")} rows={4} /></label>
    <div className="coordinates"><label>X<input name="x" type="number" step="any" min={-100000} max={100000} {...field("x")} required /></label><label>Y<input name="y" type="number" step="any" min={-100000} max={100000} {...field("y")} required /></label></div>

    <button disabled={busy || saveBlocked}>学習項目を保存</button>
    <button className="danger" type="button" disabled={busy} onClick={() => { if (confirm("この学習項目と接続を削除しますか？")) void onDelete(); }}>学習項目を削除</button>
    <p className="muted">ノート {node.stats.documents} / 資料 {node.stats.sources} / 未対応の指摘 {node.stats.openFindings}</p><p className="muted">各ノートの直近の完了レビューを集計。更新前のレビュー: {node.stats.outdatedReviews}</p>
  </form>;
}
