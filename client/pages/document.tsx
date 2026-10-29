import { noteSavePresentation } from "../../modules/editor/note-presentation";
import { NoteSession, type NoteBase } from "../../modules/editor/note-session";
import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { DocumentNodes } from "../../components/editor/document-nodes";
import { NoteSaveComparison } from "../../components/editor/note-save-comparison";
import { LocalRecoveryPanel } from "../../components/editor/local-recovery-panel";
import { findingHighlight, type FindingSelection } from "../../modules/editor/review-highlight";
import { ReviewPanel } from "../../components/reviews/review-panel";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { Feedback } from "../../components/common/feedback";
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
import { NoteLocalRecovery } from "../note-local-recovery";
import type { LocalCandidate } from "../local-recovery";

export default function DocumentPage() {
  const { workspaceId = "default", documentId = "" } = useParams({ strict: false });
  return <DocumentRead key={`${workspaceId}:${documentId}`} workspaceId={workspaceId} documentId={documentId} />;
}
function DocumentRead({ workspaceId, documentId }: { workspaceId: string; documentId: string }) {
  const navigate = useNavigate();
  const { reviewId, focusNewNote: focusNewNoteId } = useSearch({ from: "/workspaces/$workspaceId/documents/$documentId" });
  const [creationFocusIntent] = useState(() => focusNewNoteId === documentId);
  const [loaded, setLoaded] = useState<{ data: DocumentDetail; focusAvailable: boolean } | null>(null); const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (focusNewNoteId === undefined) return;
    // Consume the instruction before a slow read can be interrupted by Back.
    void navigate({ to: "/workspaces/$workspaceId/documents/$documentId", params: { workspaceId, documentId }, search: { reviewId }, replace: true });
  }, [documentId, focusNewNoteId, navigate, reviewId, workspaceId]);
  useEffect(() => readNote({
    load: async (signal) => documentDetailSchema.refine(({ document }) => document.id === documentId && document.workspaceId === workspaceId).parse(await request(`/documents/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`, "GET", undefined, { signal })),
    onData: (data) => setLoaded({ data, focusAvailable: document.activeElement === document.body }), onError: (e) => setError(e.message),
  }), [documentId, workspaceId, version]);
  if (error) return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><h1>ノートを開けません</h1><p role="alert">{error}</p><button onClick={() => { setError(""); setVersion((value) => value + 1); }}>ノートを再取得</button><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>学習マップへ戻る</Link></main>;
  if (!loaded) return <main className="workspace"><WorkspaceNav workspaceId={workspaceId} /><p role="status">読み込み中…</p></main>;
  return <DocumentSession initial={loaded.data} focusOnEntry={creationFocusIntent && loaded.focusAvailable} />;
}
function DocumentSession({ initial, focusOnEntry }: { initial: DocumentDetail; focusOnEntry: boolean }) {
  const { id, workspaceId } = initial.document;
  const navigate = useNavigate();
  const { reviewId: initialRunId } = useSearch({ from: "/workspaces/$workspaceId/documents/$documentId" });
  const focusNewNote = initial.content === "" && focusOnEntry;
  const [selection, setSelection] = useState<FindingSelection | null>(null);
  const [nodes, setNodes] = useState(initial.nodes);
  const [confirmedNodes, setConfirmedNodes] = useState({ version: 0, writeId: initial.document.lastWriteId });
  const [contextVersion, setContextVersion] = useState(0);
  const [resourceVersion, setResourceVersion] = useState(0);
  const [resourceConfirmation, setResourceConfirmation] = useState("");
  const [resourceProtected, setResourceProtected] = useState(false);
  const [associationProtected, setAssociationProtected] = useState(false);
  const [reviewProtected, setReviewProtected] = useState(false);
  const [paste, setPaste] = useState<InterceptedPaste | null>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [localRecovery] = useState(() => new NoteLocalRecovery(workspaceId, id));
  const [writer] = useState(() => new NoteWriter(workspaceId, id));
  useEffect(() => { writer.activate(); return () => writer.close(); }, [writer]);
  const [session] = useState(() => new NoteSession({ content: initial.content, title: initial.document.title, hash: initial.contentHash, writeId: initial.document.lastWriteId, revisionId: initial.document.currentRevisionId },
    (draft) => writer.save(draft), (draft, generation) => localRecovery.confirmed(draft, generation), (draft) => localRecovery.generationFor(draft)));
  useEffect(() => { void localRecovery.activate(session.getSnapshot); return () => localRecovery.close(); }, [localRecovery, session]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const localView = useSyncExternalStore(localRecovery.subscribe, localRecovery.getSnapshot);
  const { content, title, revisionId, dirty, saving, retryRequired, outcomeUnknown, localRecoveryPending, localRecoveryCanceled, error } = state;
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const programmaticRecovery = useRef(false);
  const restoredBody = useRef<string | null>(null);
  const canceledRedoBody = useRef<string | null>(null);
  const [restoreUndo, setRestoreUndo] = useState(false);
  const [restoreBase, setRestoreBase] = useState<NoteBase | null>(null);
  useEffect(() => { if (outcomeUnknown) localRecovery.onUnknownOutcome(session.getSnapshot()); }, [outcomeUnknown, localRecovery, session]);
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
  function openPaste(value: InterceptedPaste) { pasteRef.current = value; setResourceConfirmation(""); session.setPaused(true); setPaste(value); }
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
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const focusRetryAfterBase = useRef(false);
  useLayoutEffect(() => {
    if (!focusRetryAfterBase.current || latest || !retryRequired) return;
    focusRetryAfterBase.current = false;
    saveButtonRef.current?.focus();
  }, [latest, retryRequired]);
  const latestReadVersion = useRef(0);
  const latestReadStop = useRef<(() => void) | undefined>(undefined);
  useEffect(() => () => { latestReadStop.current?.(); }, []);
  function invalidateLatest() { latestReadVersion.current++; latestReadStop.current?.(); setLatest(null); setRecovering(false); }
  const busy = saving || recovering;
  const savePresentation = noteSavePresentation(state, { recovering, composing, paste: !!paste });
  function showEdit() { if (mode === "edit") editorRef.current?.restoreFocus(); else { focusRequested.current = true; setMode("edit"); } }
  const highlight = useMemo(() => findingHighlight(selection, revisionId, content), [selection, revisionId, content]);
  const departureProtected = dirty || busy || outcomeUnknown || localRecoveryPending || !!paste || resourceProtected || associationProtected || reviewProtected;
  useBlocker({ shouldBlockFn: () => departureProtected && !window.confirm("未保存・保存中・保存結果不明の変更、未追加の引用、未登録・登録結果を確認中の資料、または受付・指摘更新の結果を確認中のレビューがあります。このまま移動しますか？"), enableBeforeUnload: departureProtected });
  async function save() {
    if (await session.save(true)) { invalidateLatest(); setRecoveryError(""); }
  }
  function editTitle(value: string) {
    session.edit({ title: value });
    localRecovery.onHumanEdit(session.getSnapshot());
    setRestoreUndo(false);
    setRestoreBase(null);
  }
  function editContent(value: string, historyEvent: "undo" | "redo" | null) {
    if (!programmaticRecovery.current) {
      if (historyEvent === "redo" && canceledRedoBody.current === value) session.requireExplicitLocalSave();
      else if (historyEvent === null) canceledRedoBody.current = null;
    }
    session.edit({ content: value });
    if (!programmaticRecovery.current) { localRecovery.onHumanEdit(session.getSnapshot()); setRestoreUndo(false); setRestoreBase(null); }
  }
  function sameRestoreBase(saved: NoteBase) {
    return !!restoreBase && saved.content === restoreBase.content && saved.title === restoreBase.title && saved.hash === restoreBase.hash && saved.writeId === restoreBase.writeId;
  }
  function restoreCandidate(candidate: LocalCandidate) {
    const current = session.getSnapshot();
    if (current.dirty || current.saving || current.outcomeUnknown || (current.retryRequired && !current.localRecoveryCanceled) || paste || !editorRef.current) return;
    session.restoreLocalDraft({ title: candidate.title, content: candidate.content });
    programmaticRecovery.current = true;
    try { editorRef.current.restoreContent(candidate.content); }
    catch (error) { session.abortLocalRestore(); setRecoveryError(error instanceof Error ? error.message : "端末下書きを編集器へ復元できませんでした。"); return; }
    finally { programmaticRecovery.current = false; }
    restoredBody.current = candidate.content;
    canceledRedoBody.current = null;
    setRestoreBase({ ...current.saved });
    localRecovery.markRestored(candidate);
    setRestoreUndo(true);
    if (mode === "edit") editorRef.current.restoreFocus();
    else { focusRequested.current = true; setMode("edit"); }
  }
  function undoRestore() {
    const current = session.getSnapshot();
    if (!restoreUndo || !current.localRecoveryPending || current.saving || paste || !sameRestoreBase(current.saved)) { setRestoreUndo(false); return; }
    programmaticRecovery.current = true;
    try {
      if (!editorRef.current?.undoRestore()) return;
      session.cancelLocalRestore();
      canceledRedoBody.current = restoredBody.current;
      restoredBody.current = null;
      localRecovery.clearRestored();
      setRestoreUndo(false);
      setRestoreBase(null);
    } finally { programmaticRecovery.current = false; }
  }
  return <main className="document-workspace" onKeyDown={(event) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (!busy && !outcomeUnknown && !paste && !composing && title.trim()) void save();
    }
  }}>
    <header className="app-header note-header"><Link to="/workspaces/$workspaceId/roadmaps" params={{ workspaceId }}>← 学習マップ</Link><h1>ノート</h1><div className="mode-switch" role="group" aria-label="ノートの表示モード"><button className="secondary" aria-pressed={mode === "read"} disabled={!!paste} onClick={() => { if (mode === "edit") editorRef.current?.rememberPosition(); setMode("read"); }}>閲覧</button><button className="secondary" aria-pressed={mode === "edit"} disabled={!!paste} onClick={showEdit}>編集</button></div><span className="save-state" role="status" aria-atomic="true" data-attention={savePresentation.attention} title={savePresentation.detail}>{savePresentation.label}</span><button ref={saveButtonRef} className="secondary" disabled={busy || outcomeUnknown || !!paste || composing || !title.trim()} onClick={() => { void save(); }}>{localRecoveryCanceled ? "自動保存を再開" : localRecoveryPending ? "復元した下書きを保存" : retryRequired ? "保存を再試行" : "保存"}</button><details className="note-navigation"><summary>メニュー</summary><WorkspaceNav workspaceId={workspaceId} /></details></header>
    {error && <p role="alert" className="error">{error} 自動保存を停止しています。入力内容はこの画面に残っています。{outcomeUnknown ? "直前の保存・引用がサーバーに反映されたかは不明です。タブを閉じたり再読み込みしたりすると、サーバーに反映されていない入力は復元できない可能性があります。「最新の保存内容を確認」で保存済みの本文と名前を確かめてください。この取得だけでは引用の成否は確定しません。現在の本文と名前を保存する場合だけ、「確認した内容を基準に再試行」の後に「保存を再試行」を押してください。確認だけでは保存しません。" : "再読み込みする前に本文と名前を確認してください。"}</p>}{recoveryError && <p role="alert" className="error">{recoveryError}</p>}
    {retryRequired && (!localRecoveryPending || error) && <button disabled={busy || !!paste} onClick={() => { const version = ++latestReadVersion.current; latestReadStop.current?.(); setLatest(null); setRecovering(true); setRecoveryError(""); latestReadStop.current = readNote({ load: async (signal) => documentDetailSchema.refine(({ document }) => document.id === id && document.workspaceId === workspaceId).parse(await request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "GET", undefined, { signal })), onData: (data) => { if (version === latestReadVersion.current) { setLatest(data); setRecovering(false); } }, onError: (e) => { if (version === latestReadVersion.current) { setRecoveryError(e.message); setRecovering(false); } } }); }}>最新の保存内容を確認</button>}
    {latest && <button className="secondary" onClick={() => latestPanelRef.current?.scrollIntoView({ block: "start" })}>取得した保存内容を見る</button>}
    <div className="document-toolbar" data-attention={savePresentation.attention}>

      {mode === "edit" && <><button className="secondary" data-preview-toggle aria-pressed={showPreview} disabled={!!paste} onClick={togglePreview}>{showPreview ? "プレビューを非表示" : "プレビューを表示"}</button><button className="secondary" disabled={!!paste} onClick={() => editorRef.current?.openSearch()}>本文を検索</button></>}
      <button className="secondary local-recovery-jump" onClick={() => document.getElementById("local-recovery")?.scrollIntoView({ block: "start" })}>端末内の下書き{localView.candidates.length ? `（候補${localView.candidates.length}件）` : ""}</button>
      <p className="muted" data-save-detail>{savePresentation.detail}</p>
    </div>
    <label className="document-title" hidden={mode !== "edit"}><span className="visually-hidden">ノート名（必須）</span><textarea ref={titleRef} rows={1} value={title} onChange={(e) => editTitle(e.target.value)} onCompositionStart={() => compositionChange(true)} onCompositionEnd={() => compositionChange(false)} onKeyDown={(event) => { if (event.key === "Enter" && !composing && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); editorRef.current?.restoreFocus(); } }} maxLength={200} required /></label>{mode === "read" && <h2 className="note-reading-title">{title}</h2>}
    {mode === "edit" && !title.trim() && <p className="muted">ノート名を入力すると自動保存できます。</p>}
    <div className={`editor-split${showPreview ? "" : " editor-only"}`} hidden={mode !== "edit"}><section><h2>本文（Markdown）</h2><MarkdownEditor initialContent={initial.content} focusOnMount={focusNewNote} editorRef={editorRef} onChange={editContent} onPaste={openPaste} onCompositionChange={compositionChange} highlight={highlight} highlightRequest={selection} /></section>{showPreview && <section><h2>プレビュー</h2><MarkdownPreview content={content} /></section>}</div>
    {mode === "read" && <section className="note-reading" aria-label="閲覧モード">{content ? <MarkdownPreview content={content} label="ノート本文" /> : <p className="empty-state">本文はまだありません。「編集」に切り替えて書き始めましょう。</p>}</section>}
    {paste && <PasteDialog paste={paste} quoteBlocked={outcomeUnknown || localRecoveryPending} onClose={() => closePaste(paste)} onResource={async (input) => { await registerResource(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input); setResourceVersion((v) => v + 1); closePaste(paste); }} onResourceCheck={(input) => checkResourceRegistration(`/documents/${id}/resources?workspaceId=${encodeURIComponent(workspaceId)}`, workspaceId, input)} onResourceConfirmed={(_resource, message) => { if (pasteRef.current !== paste) return; setResourceConfirmation(message); setResourceVersion((v) => v + 1); closePaste(paste); }} onQuote={async (sourceUrl, sourceTitle) => {
      await session.addQuote(paste.content, (draft) => writer.quote({ text: paste.text, sourceUrl, sourceTitle, from: paste.from, to: paste.to, ...draft }), (content) => {
        if (!editorRef.current) throw new Error("ノートを閉じています");
        programmaticRecovery.current = true;
        try { editorRef.current.applyQuote(paste, content); }
        finally { programmaticRecovery.current = false; }
      });
      invalidateLatest(); closePaste(paste);
    }} />}
    {resourceConfirmation && <Feedback>{resourceConfirmation}</Feedback>}
    {latest && <section className="latest-document" ref={latestPanelRef} aria-label="最新の保存内容"><h2>最新の保存内容</h2><NoteSaveComparison title={title} content={content} nodes={nodes} latest={latest} /><p>編集中の本文と名前は保持されています。{outcomeUnknown ? "この取得結果だけでは直前の保存・引用の成功・失敗は確定しません。現在の入力を保存すると、確認した本文と名前を置き換えます。" : "確認後、現在の入力を保存する場合は再試行してください。"}</p><button disabled={busy || !!paste} onClick={() => { if (outcomeUnknown && !window.confirm("直前の保存・引用の結果は不明です。確認した保存内容を基準に、現在の本文と名前で置き換えるために保存を再開しますか？確認だけでは書き込みません。")) return; session.acceptBase({ title: latest.document.title, content: latest.content, hash: latest.contentHash, writeId: latest.document.lastWriteId, revisionId: latest.document.currentRevisionId }); focusRetryAfterBase.current = true; setNodes(latest.nodes); setConfirmedNodes((current) => ({ version: current.version + 1, writeId: latest.document.lastWriteId })); setContextVersion((v) => v + 1); invalidateLatest(); }}>確認した内容を基準に再試行</button></section>}
    <aside className="note-context" aria-label="ノートの補助情報">
      <details className="note-context-panel" data-note-panel="goals"><summary>目標・関連{associationProtected ? "（未確定の変更あり）" : ""}</summary>
    <DocumentNodes documentId={id} workspaceId={workspaceId} nodes={nodes} confirmation={confirmedNodes} disabled={busy || !!paste} writeBlocked={outcomeUnknown || localRecoveryPending} onDraftProtectionChange={setAssociationProtected} onRefresh={() => setContextVersion((value) => value + 1)} onLinkedRemovalConfirmed={() => { if (latest || recovering) setRecoveryError("項目の再取得で関連の状態が変わりました。最新の保存内容をもう一度確認してください。本文と名前は保持しています。"); invalidateLatest(); }} onSave={async (nodeIds, onWrite) => {
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
    <LocalRecoveryPanel view={localView} note={state} onEnable={() => { void localRecovery.enable(session.getSnapshot); }} onDisable={() => { if (confirm("このノートの端末内候補をすべて削除し、これからの保存も無効にしますか？サーバーの保存版は変わりません。")) void localRecovery.disable(); }} onRefresh={() => { void localRecovery.refresh(); }} onRestore={restoreCandidate} onDiscard={(candidate) => { if (confirm("この端末の候補を破棄しますか？サーバーの保存版は変わりません。")) void localRecovery.discard(candidate); }} canRestore={!dirty && !busy && (!retryRequired || localRecoveryCanceled) && !outcomeUnknown && !paste} canUndoRestore={restoreUndo && localRecoveryPending && !saving && !paste && sameRestoreBase(state.saved)} onUndoRestore={undoRestore} />
    <footer><span>本文は自分の言葉で書きます。</span><button className="danger" disabled={busy || outcomeUnknown || localRecoveryPending || !!paste} onClick={() => {
      if (!confirm("このノートとMarkdownファイルを削除しますか？")) return;
      void session.remove(() => request(`/documents/${id}?workspaceId=${encodeURIComponent(workspaceId)}`, "DELETE")).then(async (removed) => {
        if (!removed) return;
        if (!await localRecovery.disable()) window.alert("ノートはサーバーから削除されましたが、端末内候補を消去できませんでした。ブラウザのサイトデータを確認してください。");
        void navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true });
      });
    }}>ノートを削除</button></footer>
  </main>;
}
