import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { request } from "../../client/api";
import { documentNodeSchema, type DocumentNode } from "../../shared/document";
import { Feedback } from "../common/feedback";

export function DocumentNodes({ documentId, workspaceId, nodes, disabled, onSave, onRefresh, onDraftProtectionChange }: { documentId: string; workspaceId: string; nodes: DocumentNode[]; disabled: boolean; onSave: (ids: string[]) => Promise<void>; onRefresh: () => void; onDraftProtectionChange?: (protectedDraft: boolean) => void }) {
  const [options, setOptions] = useState<DocumentNode[] | null>(null);
  const [selected, setSelected] = useState(nodes.map((node) => node.id));
  const savedIds = useRef(new Set(nodes.map((node) => node.id)));
  const [version, setVersion] = useState(0); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [status, setStatus] = useState("");
  const linkedIds = new Set(nodes.map((node) => node.id));
  const dirty = selected.length !== nodes.length || selected.some((id) => !linkedIds.has(id));
  const protectedDraft = dirty || busy;
  useEffect(() => { onDraftProtectionChange?.(protectedDraft); }, [onDraftProtectionChange, protectedDraft]);
  useEffect(() => () => { onDraftProtectionChange?.(false); }, [onDraftProtectionChange]);
  useEffect(() => {
    const ids = nodes.map((node) => node.id);
    if (ids.length === savedIds.current.size && ids.every((id) => savedIds.current.has(id))) return;
    savedIds.current = new Set(ids); setSelected(ids);
  }, [nodes]);
  useEffect(() => {
    let active = true;
    request(`/documents/${documentId}/node-options?workspaceId=${encodeURIComponent(workspaceId)}`).then((payload) => {
      if (!active) return;
      const { nodes } = z.object({ nodes: z.array(documentNodeSchema) }).parse(payload);
      setOptions(nodes); setError(""); setSelected((ids) => ids.filter((id) => nodes.some((node) => node.id === id)));
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [documentId, workspaceId, version]);
  const linked = options ? nodes.flatMap((node) => options.find((option) => option.id === node.id) ?? []) : nodes;
  return <section className="document-node-context" aria-label="関連する学習項目と目標"><h2>関連する学習項目と目標</h2>
    <p>目標は人間が定義します。レビューは関連する全項目の目標を確認します。</p>
    {!linked.length && <p>関連する学習項目はありません。</p>}
    {linked.map((node) => <article key={node.id}><h3>{node.title}</h3><Link to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: node.roadmapId }} search={{ nodeId: node.id }}>{node.roadmapTitle}の「{node.title}」へ戻る</Link>
      {node.learningObjectives.length ? <ul>{node.learningObjectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul> : <p>学習目標は未設定です。</p>}
    </article>)}
    <details><summary>学習項目の関連を変更</summary><p>関連だけを更新します。編集中の本文と名前は保持します。</p>
      {options === null ? <p>学習項目を読み込み中…</p> : <form onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(""); setStatus(""); void onSave(selected).then(() => setStatus("関連を更新しました。本文は保持されています。")).catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>
        <fieldset disabled={disabled || busy}><legend>関連する学習項目</legend>{options.map((node) => <label className="node-link-option" key={node.id}><input type="checkbox" checked={selected.includes(node.id)} onChange={(e) => { setSelected((ids) => e.target.checked ? [...ids, node.id] : ids.filter((id) => id !== node.id)); setStatus(""); }} />{node.roadmapTitle} / {node.title}</label>)}</fieldset>
        {dirty && <Feedback>関連の変更は未保存です。「関連を保存」で確定してください。</Feedback>}
        <button disabled={disabled || busy}>関連を保存</button><button type="button" className="secondary" disabled={disabled || busy} onClick={() => { setSelected([]); setStatus(""); }}>関連をすべて解除</button>
      </form>}
      <button className="secondary" disabled={disabled || busy} onClick={() => { setVersion((value) => value + 1); onRefresh(); }}>学習項目と目標を再取得</button>
    </details>{error && <Feedback error>{error}</Feedback>}{status && <Feedback>{status}</Feedback>}
  </section>;
}
