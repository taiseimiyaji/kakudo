import { noteSavePresentation } from "../../modules/editor/note-presentation";
import { NoteSession } from "../../modules/editor/note-session";
import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { DocumentNodes } from "../../components/editor/document-nodes";
import { findingHighlight, type FindingSelection } from "../../modules/editor/review-highlight";
import { ReviewPanel } from "../../components/reviews/review-panel";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { PasteDialog } from "../../components/editor/paste-dialog";
import type { InterceptedPaste } from "../../modules/editor/paste-policy";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { request } from "../api";
import { documentDetailSchema, documentLinksSchema, type DocumentDetail } from "../../shared/document";
import { MarkdownEditor, type MarkdownEditorHandle } from "../../components/editor/markdown-editor";
import { MarkdownPreview } from "../../components/editor/preview";
import { checkResourceRegistration, registerResource } from "../resource-registration";
import { readNote } from "../../modules/document/reading";
import { NoteWriter } from "../note-write";

export default function DocumentPage() {
  const { workspaceId = "default", documentId = "" } = useParams({ strict: false });
  return <DocumentRead key={`${workspaceId}:${documentId}`} workspaceId={workspaceId} documentId={documentId} />;
}
function DocumentRead({ workspaceId, documentId }: { workspaceId: string; documentId: string }) {
  const [data, setData] = useState<DocumentDetail | null>(null); const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => readNote({
    load: async (signal) => documentDetailSchema.refine(({ document }) => document.id === documentId && document.workspaceId === workspaceId).parse(await request(`/documents/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`, "GET", undefined, { signal })),
    onData: setData, onError: (e) => setError(e.message),
  }), [documentId, workspaceId, version]);
  if (error) return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><h1>ノートを開けません</h1><p role="alert">{error}</p><button onClick={() => { setError(""); setVersion((value) => value + 1); }}>ノートを再取得</button><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>学習マップへ戻る</Link></main>;
  if (!data) return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><p role="status">読み込み中…</p></main>;
  return <DocumentSession initial={data} />;
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
  const [reviewProtected, setReviewProtected] = useState(false);
  const [paste, setPaste] = useState<InterceptedPaste | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [writer] = useState(() => new NoteWriter(workspaceId, id));
  useEffect(() => { writer.activate(); return () => writer.close(); }, [writer]);
  const [session] = useState(() => new NoteSession({ content: initial.content, title: initial.document.title, hash: initial.contentHash, writeId: initial.document.lastWriteId, revisionId: initial.document.currentRevisionId },
    (draft) => writer.save(draft)));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { content, title, revisionId, dirty, saving, retryRequired, outcomeUnknown, error } = state;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);
  function compositionChange(value: boolean) { session.setComposing(value); setComposing(value); }
  const [mode, setMode] = useState<"read" | "edit">(initial.content ? "read" : "edit");
  const focusRequested = useRef(false);
  useLayoutEffect(() => {
    const input = titleRef.current; if (!input) return;
    let dimensions = ""; let frame = 0;
    const resize = () => {
      const style = getComputedStyle(input);
      const next = [input.clientWidth, style.font, style.lineHeight, style.letterSpacing].join("|");
      if (next === dimensions) return;
      dimensions = next;
      input.style.height = "auto"; input.style.height = `${input.scrollHeight + 1}px`;
    };
    resize();
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize); });
    observer.observe(input);
    // The accessible label measures inherited type even when textarea height is fixed.
    const label = input.previousElementSibling; if (label) observer.observe(label);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [title, mode]);
  useLayoutEffect(() => { if (mode === "edit" && focusRequested.current) { focusRequested.current = false; editorRef.current?.restoreFocus(); } }, [mode]);
  const [showPreview, setShowPreview] = useState(() => { try { return localStorage.getItem("kakudo:note-preview") === "visible"; } catch { return false; } });
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
  const latestPanelRef = useRef<HTMLElement>(null);
  const latestReadVersion = useRef(0);
  const latestReadStop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => { latestReadStop.current?.(); }, []);
  function invalidateLatest() { latestReadVersion.current++; latestReadStop.current?.(); setLatest(null); setRecovering(false); }
  const busy = saving || recovering;
  const savePresentation = noteSavePresentation(state, { recovering, composing, paste: !!paste });
  function showEdit() { if (mode === "edit") editorRef.current?.restoreFocus(); else { focusRequested.current = true; setMode("edit"); } }
  const highlight = useMemo(() => findingHighlight(selection, revisionId, content), [selection, revisionId, content]);
  useBlocker({ shouldBlockFn: () => (dirty || busy || outcomeUnknown || resourceProtected || associationProtected || reviewProtected) && !window.confirm("未保存・保存中・保存結果不明の変更、未登録・登録結果を確認中の資料、または受付・指摘更新の結果を確認中のレビューがあります。このまま移動しますか？"), enableBeforeUnload: dirty || busy || outcomeUnknown || resourceProtected || associationProtected || reviewProtected });
  async function save() {
    if (await session.save(true)) { invalidateLatest(); setRecoveryError(""); }
  }
  return <main className="document-workspace" onKeyDown={(event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!busy && !outcomeUnknown && !paste && !composing && title.trim()) void save();
    }
  }}>
    <header className="app-header note-header"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← 学習マップ</Link><h1>ノート</h1><div className="mode-switch" role="group" aria-label="ノートの表示モード"><button className="secondary" aria-pressed={mode === "read"} disabled={!!paste} onClick={() => { if (mode === "edit") editorRef.current?.rememberPosition(); setMode("read"); }}>閲覧</button><button className="secondary" aria-pressed={mode === "edit"} disabled={!!paste} onClick={showEdit}>編集</button></div><span className="save-state" role="status" aria-atomic="true" data-attention={savePresentation.attention} title={savePresentation.detail}>{savePresentation.label}</span><button className="secondary" disabled={busy || outcomeUnknown || !!paste || composing || !title.trim()} onClick={() => { void save(); }}>{retryRequired ? "保存を再試行" : "保存"}</button><details className="note-navigation"><summary>メニュー</summary><WorkspaceNav workspaceId={workspaceId} /></details></header>
    {error && <p role="alert" className="error">{error} 自動保存を停止しています。入力内容はこの画面に残っています。{outcomeUnknown ? "最新の保存内容を確認し、現在の入力で置き換える場合だけ保存を再開してください。" : "再読み込みする前に本文と名前を確認してください。"}</p>}{recoveryError && <p role="alert" className="error">{recoveryError}</p>}
    {retryRequired && <button disabled={busy || !!paste} onClick={() => { const version = ++latestReadVersion.current; latestReadStop.current?.(); setLatest(null); setRecovering(true); setRecoveryError(""); latestReadStop.current = readNote({ load: async (signal) => documentDetailSchema.refine(({ document }) => document.id === id && document.workspaceId === workspaceId).parse(await request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "GET", undefined, { signal })), onData: (data) => { if (version === latestReadVersion.current) { setLatest(data); setRecovering(false); } }, onError: (e) => { if (version === latestReadVersion.current) { setRecoveryError(e.message); setRecovering(false); } } }); }}>最新の保存内容を確認</button>}
    {latest && <button className="secondary" onClick={() => latestPanelRef.current?.scrollIntoView({ block: "start" })}>取得した保存内容を見る</button>}
    <div className="document-toolbar">

      {mode === "edit" && <button className="secondary" aria-pressed={showPreview} disabled={!!paste} onClick={togglePreview}>{showPreview ? "プレビューを非表示" : "プレビューを表示"}</button>}
      <p className="muted" data-save-detail>{savePresentation.detail}</p>
    </div>
    {mode === "edit" ? <label className="document-title"><span className="visually-hidden">ノート名（必須）</span><textarea ref={titleRef} rows={1} value={title} onChange={(e) => session.edit({ title: e.target.value })} onCompositionStart={() => compositionChange(true)} onCompositionEnd={() => compositionChange(false)} onKeyDown={(event) => { if (event.key === "Enter" && !composing && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); editorRef.current?.restoreFocus(); } }} maxLength={200} required /></label> : <h2 className="note-reading-title">{title}</h2>}
    {mode === "edit" && !title.trim() && <p className="muted">ノート名を入力すると自動保存できます。</p>}
    <div className={`editor-split${showPreview ? "" : " editor-only"}`} hidden={mode !== "edit"}><section><h2>本文（Markdown）</h2><MarkdownEditor initialContent={initial.content} editorRef={editorRef} onChange={(content) => session.edit({ content })} onPaste={openPaste} onCompositionChange={compositionChange} highlight={highlight} /></section>{showPreview && <section><h2>プレビュー</h2><MarkdownPreview content={content} /></section>}</div>
    {mode === "read" && <section className="note-reading" aria-label="閲覧モード">{content ? <MarkdownPreview content={content} label="ノート本文" /> : <p className="empty-state">本文はまだありません。「編集」に切り替えて書き始めましょう。</p>}</section>}
    {paste && <PasteDialog paste={paste} quoteBlocked={outcomeUnknown} onClose={() => closePaste(paste)} onResource={async (input) => { await registerResource(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input); setResourceVersion((v) => v + 1); closePaste(paste); }} onResourceCheck={(input) => checkResourceRegistration(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input)} onResourceConfirmed={() => { setResourceVersion((v) => v + 1); closePaste(paste); }} onQuote={async (sourceUrl, sourceTitle) => {
      await session.addQuote(paste.content, (draft) => writer.quote({ text: paste.text, sourceUrl, sourceTitle, from: paste.from, to: paste.to, ...draft }), (content) => {
        if (!editorRef.current) throw new Error("ノートを閉じています");
        editorRef.current.applyQuote(paste, content);
      });
      invalidateLatest(); closePaste(paste);
    }} />}
    {latest && <section className="latest-document" ref={latestPanelRef} aria-label="最新の保存内容"><h2>最新の保存内容</h2><p>{latest.document.title}</p><pre>{latest.content}</pre><p>編集中の本文と名前は保持されています。{outcomeUnknown ? "この取得結果だけでは直前の保存・引用の成功・失敗は確定しません。現在の入力を保存すると、確認した本文と名前を置き換えます。" : "確認後、現在の入力を保存する場合は再試行してください。"}</p><button disabled={busy || !!paste} onClick={() => { if (outcomeUnknown && !window.confirm("直前の保存・引用の結果は不明です。確認した保存内容を基準に、現在の本文と名前で置き換えるために保存を再開しますか？確認だけでは書き込みません。")) return; session.acceptBase({ title: latest.document.title, content: latest.content, hash: latest.contentHash, writeId: latest.document.lastWriteId, revisionId: latest.document.currentRevisionId }); setNodes(latest.nodes); setConfirmedNodes((current) => ({ version: current.version + 1, writeId: latest.document.lastWriteId })); setContextVersion((v) => v + 1); invalidateLatest(); }}>確認した内容を基準に再試行</button></section>}
    <aside className="note-context" aria-label="ノートの補助情報">
      <details className="note-context-panel" data-note-panel="goals"><summary>目標・関連{associationProtected ? "（未確定の変更あり）" : ""}</summary>
    <DocumentNodes documentId={id} workspaceId={workspaceId} nodes={nodes} confirmation={confirmedNodes} disabled={busy || !!paste} writeBlocked={outcomeUnknown} onDraftProtectionChange={setAssociationProtected} onRefresh={() => setContextVersion((value) => value + 1)} onLinkedRemovalConfirmed={() => { if (latest || recovering) setRecoveryError("項目の再取得で関連の状態が変わりました。最新の保存内容をもう一度確認してください。本文と名前は保持しています。"); invalidateLatest(); }} onSave={async (nodeIds, onWrite) => {
      invalidateLatest();
      const result = await session.updateContext((baseWriteId) => { onWrite(baseWriteId); return request(`/documents/${id}/nodes?workspaceId=${encodeURIComponent(workspaceId)}`, "PATCH", { nodeIds, baseWriteId }).then((payload) => documentLinksSchema.parse(payload)); });
      setNodes(result.nodes); setContextVersion((v) => v + 1);
    }} />
      </details>
      <details className="note-context-panel" data-note-panel="review" open={initialRunId ? true : undefined}><summary>レビュー{reviewProtected ? "（確認中の操作あり）" : ""}</summary>
    <ReviewPanel documentId={id} workspaceId={workspaceId} revisionId={revisionId} dirty={dirty || busy || retryRequired} content={content} onSelect={(finding) => { setSelection(finding); if (finding) setMode("edit"); }} initialRunId={initialRunId} contextVersion={contextVersion} onReviewProtectionChange={setReviewProtected} />
      </details>
      <details className="note-context-panel" data-note-panel="resources"><summary>資料{resourceProtected ? "（未確定の変更あり）" : ""}</summary>
    <ResourcePanel workspaceId={workspaceId} target={{ kind: "document", id }} refresh={resourceVersion} onDraftProtectionChange={setResourceProtected} />
      </details>
      <details className="document-metadata"><summary>保存情報</summary><p className="document-path">{initial.document.path}</p><p aria-label="現在の保存版">保存版: {revisionId ?? "未作成（保存すると作成されます）"}</p></details>
    </aside>
    <footer><span>本文は自分の言葉で書きます。</span><button className="danger" disabled={busy || outcomeUnknown || !!paste} onClick={() => {
      if (!confirm("このノートとMarkdownファイルを削除しますか？")) return;
      void session.remove(() => request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "DELETE")).then((removed) => { if (removed) void navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true }); });
    }}>ノートを削除</button></footer>
  </main>;
}
