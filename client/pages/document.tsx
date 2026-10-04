import { NoteSession, type NoteSaveResult } from "../../modules/editor/note-session";
import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { DocumentNodes } from "../../components/editor/document-nodes";
import { findingHighlight, type FindingSelection } from "../../modules/editor/review-highlight";
import { ReviewPanel } from "../../components/reviews/review-panel";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { PasteDialog } from "../../components/editor/paste-dialog";
import type { InterceptedPaste } from "../../modules/editor/paste-policy";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { request } from "../api";
import { documentDetailSchema, documentLinksSchema, type DocumentDetail } from "../../shared/document";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../components/editor/markdown-editor";
import { MarkdownPreview } from "../../components/editor/preview";
import { checkResourceRegistration, registerResource } from "../resource-registration";

export default function DocumentPage() {
  const { workspaceId = "default", documentId = "" } = useParams({ strict: false });
  const [data, setData] = useState<DocumentDetail | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request(`/documents/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`).then((payload) => { if (active) setData(documentDetailSchema.parse(payload)); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [documentId, workspaceId]);
  if (error) return <main className="workspace"><h1>ノートを開けません</h1><p role="alert">{error}</p><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>学習マップへ戻る</Link></main>;
  if (!data || data.document.id !== documentId) return <main className="workspace">読み込み中…</main>;
  return <DocumentSession key={documentId} initial={data} />;
}
function DocumentSession({ initial }: { initial: DocumentDetail }) {
  const { id, workspaceId } = initial.document;
  const navigate = useNavigate();
  const { reviewId: initialRunId } = useSearch({ from: "/workspaces/$workspaceId/documents/$documentId" });
  const [selection, setSelection] = useState<FindingSelection | null>(null);
  const [nodes, setNodes] = useState(initial.nodes);
  const [confirmedNodes, setConfirmedNodes] = useState({ version: 0, writeId: initial.document.lastWriteId });
  const [contextVersion, setContextVersion] = useState(0);
  const [resourceVersion, setResourceVersion] = useState(0);
  const [resourceProtected, setResourceProtected] = useState(false);
  const [associationProtected, setAssociationProtected] = useState(false);
  const [paste, setPaste] = useState<InterceptedPaste | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [session] = useState(() => new NoteSession({ content: initial.content, title: initial.document.title, hash: initial.contentHash, writeId: initial.document.lastWriteId, revisionId: initial.document.currentRevisionId },
    (draft) => request<NoteSaveResult>(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "PUT", draft)));
  const { content, title, revisionId, dirty, saving, retryRequired, error, status } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [mode, setMode] = useState<"read" | "edit">(initial.content ? "read" : "edit");
  const [showPreview, setShowPreview] = useState(() => { try { return localStorage.getItem("kakudo:note-preview") !== "hidden"; } catch { return true; } });
  const pasteRef = useRef<InterceptedPaste | null>(null);
  useEffect(() => { const timer = setInterval(() => session.tick(), 1000); return () => clearInterval(timer); }, [session]);
  function openPaste(value: InterceptedPaste) { pasteRef.current = value; session.setPaused(true); setPaste(value); }
  function closePaste(expected = pasteRef.current) {
    if (pasteRef.current !== expected) return;
    pasteRef.current = null; setPaste(null); session.setPaused(false);
  }
  function togglePreview() {
    const next = !showPreview; setShowPreview(next);
    try { localStorage.setItem("kakudo:note-preview", next ? "visible" : "hidden"); } catch { /* Only a display preference. */ }
  }
  const [latest, setLatest] = useState<DocumentDetail | null>(null);
  const [recoveryError, setRecoveryError] = useState(""); const [recovering, setRecovering] = useState(false);
  const busy = saving || recovering;
  const highlight = useMemo(() => findingHighlight(selection, revisionId, content), [selection, revisionId, content]);
  useBlocker({ shouldBlockFn: () => (dirty || busy || resourceProtected || associationProtected) && !window.confirm("未保存・保存中の変更、または未登録・登録結果を確認中の資料があります。このまま移動しますか？"), enableBeforeUnload: dirty || busy || resourceProtected || associationProtected });
  async function save() {
    if (await session.save(true)) { setLatest(null); setRecoveryError(""); }
  }
  return <main className="document-workspace">
    <header className="app-header"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← 学習マップ</Link><h1>ノート</h1><span className="save-state">{recovering ? "確認中…" : saving ? "保存中…" : error ? "保存できませんでした" : dirty ? "未保存の変更" : "保存済み"}</span><button className="secondary" disabled={busy || !!paste || !title.trim()} onClick={() => { void save(); }}>{retryRequired ? "保存を再試行" : "保存"}</button></header><WorkspaceNav workspaceId={workspaceId} />
    {error && <p role="alert" className="error">{error}。自動保存を停止しています。入力内容はこの画面に残っています。再読み込みする前に本文と名前を確認してください。</p>}{recoveryError && <p role="alert" className="error">{recoveryError}</p>}<p className="save-message" role="status">{status}</p>
    {retryRequired && <button disabled={busy || !!paste} onClick={() => { setRecovering(true); setRecoveryError(""); void request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`).then((payload) => setLatest(documentDetailSchema.parse(payload))).catch((e) => setRecoveryError(e.message)).finally(() => setRecovering(false)); }}>最新の保存内容を確認</button>}
    {latest && <section className="latest-document" aria-label="最新の保存内容"><h2>最新の保存内容</h2><p>{latest.document.title}</p><pre>{latest.content}</pre><p>編集中の本文と名前は保持されています。確認後、現在の入力を保存する場合は再試行してください。</p><button disabled={busy || !!paste} onClick={() => { session.acceptBase({ title: latest.document.title, content: latest.content, hash: latest.contentHash, writeId: latest.document.lastWriteId, revisionId: latest.document.currentRevisionId }); setNodes(latest.nodes); setConfirmedNodes((current) => ({ version: current.version + 1, writeId: latest.document.lastWriteId })); setContextVersion((v) => v + 1); setLatest(null); }}>確認した内容を基準に再試行</button></section>}
    <div className="document-toolbar">
      <div className="mode-switch" role="group" aria-label="ノートの表示モード"><button className="secondary" aria-pressed={mode === "read"} disabled={!!paste} onClick={() => setMode("read")}>閲覧</button><button className="secondary" aria-pressed={mode === "edit"} disabled={!!paste} onClick={() => setMode("edit")}>編集</button></div>
      {mode === "edit" && <button className="secondary" aria-pressed={showPreview} disabled={!!paste} onClick={togglePreview}>{showPreview ? "プレビューを非表示" : "プレビューを表示"}</button>}
      <p className="muted">変更があれば1秒ごとに自動保存します。</p>
    </div>
    {mode === "edit" ? <label className="document-title">ノート名（必須）<input value={title} onChange={(e) => session.edit({ title: e.target.value })} onCompositionStart={() => session.setComposing(true)} onCompositionEnd={() => session.setComposing(false)} maxLength={200} required /></label> : <h2 className="note-reading-title">{title}</h2>}
    {mode === "edit" && !title.trim() && <p className="muted">ノート名を入力すると自動保存できます。</p>}
    <details className="document-metadata"><summary>保存情報</summary><p className="document-path">{initial.document.path}</p><p aria-label="現在の保存版">保存版: {revisionId ?? "未作成（保存すると作成されます）"}</p></details>
    <DocumentNodes documentId={id} workspaceId={workspaceId} nodes={nodes} confirmation={confirmedNodes} disabled={busy || !!paste} onDraftProtectionChange={setAssociationProtected} onRefresh={() => setContextVersion((value) => value + 1)} onSave={async (nodeIds, onWrite) => {
      const result = await session.updateContext((baseWriteId) => { onWrite(baseWriteId); return request(`/documents/${id}/nodes?workspaceId=${encodeURIComponent(workspaceId)}`, "PATCH", { nodeIds, baseWriteId }).then((payload) => documentLinksSchema.parse(payload)); });
      setNodes(result.nodes); setContextVersion((v) => v + 1);
    }} />
    <div className={`editor-split${showPreview ? "" : " editor-only"}`} hidden={mode !== "edit"}><section><h2>本文（Markdown）</h2><MarkdownEditor initialContent={initial.content} editorRef={editorRef} onChange={(content) => session.edit({ content })} onPaste={openPaste} onCompositionChange={(composing) => session.setComposing(composing)} highlight={highlight} /></section>{showPreview && <section><h2>プレビュー</h2><MarkdownPreview content={content} /></section>}</div>
    {mode === "read" && <section className="note-reading" aria-label="閲覧モード">{content ? <MarkdownPreview content={content} label="ノート本文" /> : <p className="empty-state">本文はまだありません。「編集」に切り替えて書き始めましょう。</p>}</section>}
    {paste && <PasteDialog paste={paste} onClose={() => closePaste(paste)} onResource={async (input) => { await registerResource(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input); setResourceVersion((v) => v + 1); closePaste(paste); }} onResourceCheck={(input) => checkResourceRegistration(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input)} onResourceConfirmed={() => { setResourceVersion((v) => v + 1); closePaste(paste); }} onQuote={async (sourceUrl, sourceTitle) => {
      await session.addQuote(paste.content, (draft) => request<NoteSaveResult & { content: string }>(`/documents/${id}/quotes?workspaceId=${encodeURIComponent(workspaceId)}`, "POST", { text: paste.text, sourceUrl, sourceTitle, from: paste.from, to: paste.to, ...draft }), (content) => {
        if (!editorRef.current) throw new Error("ノートを閉じています");
        editorRef.current.applyQuote(paste, content);
      });
      setLatest(null); closePaste(paste);
    }} />}
    <ReviewPanel documentId={id} workspaceId={workspaceId} revisionId={revisionId} dirty={dirty || busy || retryRequired} content={content} onSelect={(finding) => { setSelection(finding); if (finding) setMode("edit"); }} initialRunId={initialRunId} contextVersion={contextVersion} />
    <ResourcePanel workspaceId={workspaceId} target={{ kind: "document", id }} refresh={resourceVersion} onDraftProtectionChange={setResourceProtected} />
    <footer><span>本文は自分の言葉で書きます。</span><button className="danger" disabled={busy || !!paste} onClick={() => {
      if (!confirm("このノートとMarkdownファイルを削除しますか？")) return;
      void session.remove(() => request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "DELETE")).then((removed) => { if (removed) void navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true }); });
    }}>ノートを削除</button></footer>
  </main>;
}
