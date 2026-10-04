import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { request } from "../../client/api";
import { documentNodeSchema, type DocumentNode } from "../../shared/document";
import { Feedback } from "../common/feedback";

export function DocumentNodes({ documentId, workspaceId, nodes, confirmation, disabled, onSave, onRefresh, onDraftProtectionChange, onLinkedRemovalConfirmed }: { documentId: string; workspaceId: string; nodes: DocumentNode[]; confirmation: { version: number; writeId: string | null }; disabled: boolean; onSave: (ids: string[], onWrite: (baseWriteId: string | null) => void) => Promise<void>; onRefresh: () => void; onDraftProtectionChange?: (protectedDraft: boolean) => void; onLinkedRemovalConfirmed?: () => void }) {
  const context = useMemo(() => ({ documentId, workspaceId, nodes, confirmationVersion: confirmation.version }), [documentId, workspaceId, nodes, confirmation.version]);
  const contextRef = useRef(context);
  const removalCallback = useRef(onLinkedRemovalConfirmed);
  useLayoutEffect(() => { contextRef.current = context; removalCallback.current = onLinkedRemovalConfirmed; }, [context, onLinkedRemovalConfirmed]);
  const [options, setOptions] = useState<{ items: DocumentNode[]; context: typeof context } | null>(null);
  const [selected, setSelected] = useState(nodes.map((node) => node.id));
  const savedIds = useRef(new Set(nodes.map((node) => node.id)));
  const failedSubmission = useRef<{ ids: string[]; baseWriteId: string | null | undefined } | null>(null);
  const seenConfirmationVersion = useRef(confirmation.version);
  const [version, setVersion] = useState(0); const [error, setError] = useState(""); const [optionsError, setOptionsError] = useState(""); const [busy, setBusy] = useState(false); const [status, setStatus] = useState("");
  // Only an options read for this saved baseline can confirm that a linked node was deleted.
  const linked = options?.context === context ? nodes.flatMap((node) => options.items.find((option) => option.id === node.id) ?? []) : nodes;
  let availableOptions = options?.items ?? null;
  if (options && options.context !== context) {
    if (options.context.documentId !== documentId || options.context.workspaceId !== workspaceId) availableOptions = null;
    else {
      const confirmed = new Map(nodes.map((node) => [node.id, node]));
      const cachedIds = new Set(options.items.map((node) => node.id));
      availableOptions = [...options.items.map((node) => confirmed.get(node.id) ?? node), ...nodes.filter((node) => !cachedIds.has(node.id))];
    }
  }
  const linkedIds = new Set(linked.map((node) => node.id));
  const dirty = selected.length !== linked.length || selected.some((id) => !linkedIds.has(id));
  const protectedDraft = dirty || busy;
  useEffect(() => { onDraftProtectionChange?.(protectedDraft); }, [onDraftProtectionChange, protectedDraft]);
  useEffect(() => () => { onDraftProtectionChange?.(false); }, [onDraftProtectionChange]);
  useEffect(() => {
    const ids = nodes.map((node) => node.id);
    const sameSavedIds = ids.length === savedIds.current.size && ids.every((id) => savedIds.current.has(id));
    const freshlyConfirmed = confirmation.version !== seenConfirmationVersion.current;
    seenConfirmationVersion.current = confirmation.version;
    const failed = failedSubmission.current;
    if (freshlyConfirmed && failed && ids.length === failed.ids.length && ids.every((id) => failed.ids.includes(id)) &&
      (!sameSavedIds || (failed.baseWriteId !== undefined && confirmation.writeId !== failed.baseWriteId))) {
      failedSubmission.current = null;
      setError(""); setStatus("関連の保存結果を確認しました。");
    }
    if (sameSavedIds) return;
    savedIds.current = new Set(ids); setSelected(ids);
  }, [nodes, confirmation]);
  useEffect(() => {
    let active = true;
    request(`/documents/${documentId}/node-options?workspaceId=${encodeURIComponent(workspaceId)}`).then((payload) => {
      if (!active || contextRef.current !== context) return;
      const { nodes: items } = z.object({ nodes: z.array(documentNodeSchema) }).parse(payload);
      setOptions({ items, context }); setOptionsError(""); setSelected((ids) => ids.filter((id) => items.some((node) => node.id === id)));
      if (nodes.some((node) => !items.some((item) => item.id === node.id))) removalCallback.current?.();
    }).catch((e) => { if (active && contextRef.current === context) setOptionsError(e.message); });
    return () => { active = false; };
  }, [documentId, workspaceId, version, context]);
  return <section className="document-node-context" aria-label="関連する学習項目と目標"><h2>関連する学習項目と目標</h2>
    <p>目標は人間が定義します。レビューは関連する全項目の目標を確認します。</p>
    {!linked.length && <p>関連する学習項目はありません。</p>}
    {linked.map((node) => <article key={node.id}><h3>{node.title}</h3><Link to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: node.roadmapId }} search={{ nodeId: node.id }}>{node.roadmapTitle}の「{node.title}」へ戻る</Link>
      {node.learningObjectives.length ? <ul>{node.learningObjectives.map((objective, index) => <li key={index}>{objective}</li>)}</ul> : <p>学習目標は未設定です。</p>}
    </article>)}
    <details><summary>学習項目の関連を変更</summary><p>関連だけを更新します。編集中の本文と名前は保持します。</p>
      {availableOptions === null ? <p>学習項目を読み込み中…</p> : <form onSubmit={(event) => { event.preventDefault(); const submitted = [...selected]; let baseWriteId: string | null | undefined; failedSubmission.current = null; setBusy(true); setError(""); setStatus(""); void onSave(submitted, (id) => { baseWriteId = id; }).then(() => setStatus("関連を更新しました。本文は保持されています。")).catch((e) => { failedSubmission.current = { ids: submitted, baseWriteId }; setError(e.message); }).finally(() => setBusy(false)); }}>
        <fieldset disabled={disabled || busy}><legend>関連する学習項目</legend>{availableOptions.map((node) => <label className="node-link-option" key={node.id}><input type="checkbox" checked={selected.includes(node.id)} onChange={(e) => { setSelected((ids) => e.target.checked ? [...ids, node.id] : ids.filter((id) => id !== node.id)); setStatus(""); }} />{node.roadmapTitle} / {node.title}</label>)}</fieldset>
        {dirty && <Feedback>関連の変更は未保存です。「関連を保存」で確定してください。</Feedback>}
        <button disabled={disabled || busy}>関連を保存</button><button type="button" className="secondary" disabled={disabled || busy} onClick={() => { setSelected([]); setStatus(""); }}>関連をすべて解除</button>
      </form>}
      <button className="secondary" disabled={disabled || busy} onClick={() => { setVersion((value) => value + 1); onRefresh(); }}>学習項目と目標を再取得</button>
    </details>{optionsError && <Feedback error>{optionsError}</Feedback>}{error && <Feedback error>{error}</Feedback>}{status && <Feedback>{status}</Feedback>}
  </section>;
}
