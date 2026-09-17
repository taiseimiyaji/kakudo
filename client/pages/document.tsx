import { useEffect, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { request } from "../api";
import { documentDetailSchema, type DocumentDetail } from "../../shared/document";
import { MarkdownEditor } from "../../components/editor/markdown-editor";
import { MarkdownPreview } from "../../components/editor/preview";

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
  const [content, setContent] = useState(initial.content); const [title, setTitle] = useState(initial.document.title);
  const [saved, setSaved] = useState({ content: initial.content, title: initial.document.title, hash: initial.contentHash });
  const [status, setStatus] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const dirty = content !== saved.content || title !== saved.title;
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("未保存の変更を破棄して移動しますか？"), enableBeforeUnload: dirty });
  async function save() {
    setBusy(true); setError(""); setStatus("");
    const snapshot = { content, title };
    try {
      const result = await request<{ contentHash: string }>(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "PUT", { ...snapshot, baseHash: saved.hash });
      setSaved({ ...snapshot, hash: result.contentHash }); setStatus("保存しました");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className="document-workspace">
    <header className="app-header"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← Knowledge Map</Link><h1>Document</h1><span>{dirty ? "未保存の変更" : "保存済み"}</span><button disabled={busy || !title.trim()} onClick={() => { void save(); }}>保存</button></header>
    {error && <p role="alert" className="error">{error}（再読み込みする前に未保存の本文を確認してください）</p>}{status && <p role="status">{status}</p>}
    <label className="document-title">Document名<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></label>
    <p className="document-path">{initial.document.path}</p>
    <div className="editor-split"><section><h2>Markdown</h2><MarkdownEditor initialContent={initial.content} onChange={setContent} /></section><section><h2>Preview</h2><MarkdownPreview content={content} /></section></div>
    <footer><span>Sources / Reviewsは準備中です。本文は自分の言葉で書きます。</span><button className="danger" disabled={busy} onClick={() => { if (!confirm("このDocumentとMarkdownファイルを削除しますか？")) return; setBusy(true); void request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "DELETE").then(() => navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true })).catch((e) => { setError(e.message); setBusy(false); }); }}>Documentを削除</button></footer>
  </main>;
}
