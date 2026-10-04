import { DocumentNodes } from "../../components/editor/document-nodes";
import { findingHighlight, type FindingSelection } from "../../modules/editor/review-highlight";
import { ReviewPanel } from "../../components/reviews/review-panel";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { PasteDialog } from "../../components/editor/paste-dialog";
import type { InterceptedPaste } from "../../modules/editor/paste-policy";
import { useEffect, useMemo, useRef, useState } from "react";
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
  if (error) return <main className="workspace"><h1>Documentを開けません</h1><p role="alert">{error}</p><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>Mapへ戻る</Link></main>;
  if (!data || data.document.id !== documentId) return <main className="workspace">読み込み中…</main>;
  return <DocumentSession key={documentId} initial={data} />;
}
function DocumentSession({ initial }: { initial: DocumentDetail }) {
  const { id, workspaceId } = initial.document;
  const navigate = useNavigate();
  const { reviewId: initialRunId } = useSearch({ from: "/workspaces/$workspaceId/documents/$documentId" });
  const [selection, setSelection] = useState<FindingSelection | null>(null);
  const [revisionId, setRevisionId] = useState(initial.document.currentRevisionId);
  const [nodes, setNodes] = useState(initial.nodes);
  const [contextVersion, setContextVersion] = useState(0);
  const [resourceVersion, setResourceVersion] = useState(0);
  const [paste, setPaste] = useState<InterceptedPaste | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [content, setContent] = useState(initial.content); const [title, setTitle] = useState(initial.document.title);
  const [saved, setSaved] = useState({ content: initial.content, title: initial.document.title, hash: initial.contentHash, writeId: initial.document.lastWriteId });
  const [latest, setLatest] = useState<DocumentDetail | null>(null);
  const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const highlight = useMemo(() => findingHighlight(selection, revisionId, content), [selection, revisionId, content]);
  const dirty = content !== saved.content || title !== saved.title;
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("未保存の変更を破棄して移動しますか？"), enableBeforeUnload: dirty });
  async function save() {
    setBusy(true); setError(""); setStatus("");
    const snapshot = { content, title };
    try {
      const result = await request<{ contentHash: string; document: { currentRevisionId: string | null; lastWriteId: string | null } }>(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "PUT", { ...snapshot, baseHash: saved.hash, baseWriteId: saved.writeId });
      setSaved({ ...snapshot, hash: result.contentHash, writeId: result.document.lastWriteId }); setRevisionId(result.document.currentRevisionId); setStatus("保存しました"); setLatest(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="document-workspace">
    <header className="app-header"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← Knowledge Map</Link><h1>Document</h1><span>{dirty ? "未保存の変更" : "保存済み"}</span><button disabled={busy || !title.trim()} onClick={() => { void save(); }}>保存</button></header>
    {error && <p role="alert" className="error">{error}（再読み込みする前に未保存の本文を確認してください）</p>}{status && <p role="status">{status}</p>}
    {error && <button disabled={busy} onClick={() => { setBusy(true); void request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`).then((payload) => setLatest(documentDetailSchema.parse(payload))).catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>最新の保存内容を確認</button>}
    {latest && <section className="latest-document" aria-label="最新の保存内容"><h2>最新の保存内容</h2><p>{latest.document.title}</p><pre>{latest.content}</pre><p>編集中の本文と名前は保持されています。確認後、現在の入力を保存する場合は再試行してください。</p><button disabled={busy} onClick={() => { setSaved({ title: latest.document.title, content: latest.content, hash: latest.contentHash, writeId: latest.document.lastWriteId }); setRevisionId(latest.document.currentRevisionId); setNodes(latest.nodes); setContextVersion((v) => v + 1); setLatest(null); setError(""); setStatus("最新の保存内容を確認しました。現在の入力で保存を再試行できます。"); }}>確認した内容を基準に再試行</button></section>}
    <label className="document-title">Document名<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
    <p className="document-path">{initial.document.path}</p><p aria-label="現在のRevision">Revision: {revisionId ?? "未作成（保存すると作成されます）"}</p>
    <DocumentNodes documentId={id} workspaceId={workspaceId} nodes={nodes} disabled={busy || !!paste} onRefresh={() => setContextVersion((value) => value + 1)} onSave={async (nodeIds) => {
      setBusy(true); setError("");
      try {
        const result = documentLinksSchema.parse(await request(`/documents/${id}/nodes?workspaceId=${encodeURIComponent(workspaceId)}`, "PATCH", { nodeIds, baseWriteId: saved.writeId }));
        setNodes(result.nodes); setSaved((current) => ({ ...current, writeId: result.document.lastWriteId })); setContextVersion((v) => v + 1);
      } catch (e) { setError((e as Error).message); throw e; } finally { setBusy(false); }
    }} />
    <div className="editor-split"><section><h2>Markdown</h2><MarkdownEditor initialContent={initial.content} editorRef={editorRef} onChange={setContent} onPaste={setPaste} highlight={highlight} /></section><section><h2>Preview</h2><MarkdownPreview content={content} /></section></div>
    {paste && <PasteDialog paste={paste} onClose={() => setPaste(null)} onResource={async (input) => { await registerResource(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input); setResourceVersion((v) => v + 1); setPaste((current) => current === paste ? null : current); }} onResourceCheck={(input) => checkResourceRegistration(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input)} onResourceConfirmed={() => { setResourceVersion((v) => v + 1); setPaste((current) => current === paste ? null : current); }} onQuote={async (sourceUrl, sourceTitle) => {
      try {
        const result = await request<{ content: string; contentHash: string; document: { currentRevisionId: string | null; lastWriteId: string | null } }>(`/documents/${id}/quotes?workspaceId=${encodeURIComponent(workspaceId)}`, "POST", { text: paste.text, sourceUrl, sourceTitle, from: paste.from, to: paste.to, content: paste.content, title, baseHash: saved.hash, baseWriteId: saved.writeId });
        editorRef.current?.applyQuote(paste, result.content);
        setRevisionId(result.document.currentRevisionId); setContent(result.content); setSaved({ title, content: result.content, hash: result.contentHash, writeId: result.document.lastWriteId }); setPaste(null); setStatus("引用を追加して保存しました"); setLatest(null);
      } catch (e) { setError((e as Error).message); throw e; }
    }} />}
    <ReviewPanel documentId={id} workspaceId={workspaceId} revisionId={revisionId} dirty={dirty} content={content} onSelect={setSelection} initialRunId={initialRunId} contextVersion={contextVersion} />
    <ResourcePanel workspaceId={workspaceId} target={{ kind: "document", id }} refresh={resourceVersion} />
    <footer><span>本文は自分の言葉で書きます。</span><button className="danger" disabled={busy} onClick={() => { if (!confirm("このDocumentとMarkdownファイルを削除しますか？")) return; setBusy(true); void request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "DELETE").then(() => navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true })).catch((e) => { setError(e.message); setBusy(false); }); }}>Documentを削除</button></footer>
  </main>;
}
