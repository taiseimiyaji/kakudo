import { WorkspaceNav } from "../../components/navigation/workspace-nav";
import { Feedback } from "../../components/common/feedback";
import { nextNodePosition } from "../../modules/roadmap/layout";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { NodeDocuments } from "../../components/editor/node-documents";
import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { request } from "../api";
import { roadmapDetailSchema, roadmapSchema, type RoadmapDetail, type Roadmap, type EdgeSide } from "../../shared/roadmap";
import { MapCanvas } from "../../components/roadmap/map-canvas";
import { useFormDraft } from "../hooks/use-form-draft";
import { NodeDetails, nodeFormValues } from "../../components/roadmap/node-details";

export default function RoadmapPage() {
  const { workspaceId, roadmapId } = useParams({ strict: false });
  const { nodeId } = useSearch({ strict: false });
  return <RoadmapSession key={`${workspaceId}:${roadmapId}:${nodeId ?? ""}`} />;
}
function RoadmapSession() {
  const { workspaceId = "default", roadmapId } = useParams({ strict: false });
  const navigate = useNavigate();
  const scope = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [maps, setMaps] = useState<Roadmap[]>([]);
  const [detail, setDetail] = useState<RoadmapDetail | null>(null);
  const { nodeId } = useSearch({ strict: false });
  const [selected, setSelected] = useState<string | undefined>(nodeId);
  const [selectedEdge, setSelectedEdge] = useState<string>();
  const [mapStatus, setMapStatus] = useState("");
  const [error, setError] = useState("");
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const retryDisplay = useRef<(() => Promise<void>) | null>(null);
  const [resourceProtected, setResourceProtected] = useState(false);
  const resourceProtectedRef = useRef(false);
  resourceProtectedRef.current = resourceProtected;
  const mounted = useRef(true);
  const mapCreationPending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refreshVersion = useRef(0);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = z.object({ roadmaps: z.array(roadmapSchema) }).parse(await request(`/roadmaps${scope}`));
        const result = roadmapId ? roadmapDetailSchema.parse(await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`)) : null;
        if (active) { setMaps(list.roadmaps); setDetail(result); }
      } catch (e) { if (active) setError((e as Error).message); }
    }
    void load();
    return () => { active = false; };
  }, [scope, roadmapId]);

  async function act(work: (markCommitted: () => void) => Promise<void>, recoverAfterCommit?: () => Promise<void>) {
    setBusy(true); setError(""); setRefreshFailed(false); retryDisplay.current = null;
    let committed = false;
    try { await work(() => { committed = true; }); return true; } catch (e) {
      if (!mounted.current) return false;
      if (committed) {
        const recover = recoverAfterCommit ?? (roadmapId ? refresh : null);
        if (recover) {
          try { await recover(); setError(""); return true; }
          catch { /* The write is confirmed; only the view refresh failed. */ }
        }
        setError("変更は保存されましたが、最新の表示を取得できませんでした。再取得してください。");
        retryDisplay.current = recover; setRefreshFailed(!!recover);
        return true;
      }
      setError((e as Error).message);
      // Roll back optimistic positions, then reconcile writes whose response was lost.
      setDetail((current) => current ? { ...current } : current);
      if (roadmapId) {
        try { await refresh(); }
        catch { setError(`${(e as Error).message} サーバーの最新状態を確認できません。接続を確認して再読み込みしてください。`); }
      }
      return false;
    }
    finally { if (mounted.current) setBusy(false); }
  }
  async function createMap(form: HTMLFormElement) {
    if (mapCreationPending.current || busy) return;
    const title = String(new FormData(form).get("title"));
    mapCreationPending.current = true;
    let createdId: string | undefined;
    try {
      await act(async (markCommitted) => {
        const { roadmap } = await request<{ roadmap: Roadmap }>(`/roadmaps${scope}`, "POST", { title });
        createdId = roadmap.id; markCommitted();
        if (!mounted.current) return;
        setMaps((current) => [...current, roadmap]); form.reset();
        await navigate({ to: "/workspaces/$workspaceId/roadmaps/$roadmapId", params: { workspaceId, roadmapId: roadmap.id } });
      }, async () => { if (createdId) await navigate({ to: "/workspaces/$workspaceId/roadmaps/$roadmapId", params: { workspaceId, roadmapId: createdId } }); });
    } finally { mapCreationPending.current = false; }
  }
  async function refresh() {
    const version = ++refreshVersion.current;
    const [payload, listPayload] = await Promise.all([
      request(`/roadmaps/${encodeURIComponent(roadmapId!)}${scope}`), request(`/roadmaps${scope}`),
    ]);
    const result = roadmapDetailSchema.parse(payload);
    const list = z.object({ roadmaps: z.array(roadmapSchema) }).parse(listPayload);
    if (version !== refreshVersion.current) return;
    setDetail(result); setMaps(list.roadmaps);
  }
  const node = detail && detail.roadmap.id === roadmapId ? detail.nodes.find((n) => n.id === selected) : undefined;
  const mapDraft = useFormDraft(roadmapId ?? "", { title: detail?.roadmap.title ?? "", description: detail?.roadmap.description ?? "" });
  const nodeDraft = useFormDraft(node?.id ?? "", nodeFormValues(node));
  const edge = detail?.edges.find((e) => e.id === selectedEdge);
  const edgeDraft = useFormDraft<{ sourceSide: EdgeSide; targetSide: EdgeSide }>(edge?.id ?? "", { sourceSide: edge?.sourceSide ?? "bottom", targetSide: edge?.targetSide ?? "top" });
  const dirty = mapDraft.dirty || nodeDraft.dirty || edgeDraft.dirty || resourceProtected;
  const confirmDeparture = () => window.confirm("未保存の変更、または未登録・登録結果を確認中の資料があります。このまま移動しますか？");
  useBlocker({ shouldBlockFn: () => dirty && !confirmDeparture(), enableBeforeUnload: dirty });
  function selectNode(id: string | undefined) {
    if (id === selected || busy) return;
    if ((nodeDraft.dirty || edgeDraft.dirty || resourceProtected) && !confirmDeparture()) return;
    setSelected(id); setSelectedEdge(undefined);
  }
  function selectEdge(id: string | undefined) {
    if (busy) return false;
    if (id === selectedEdge) return true;
    if (edgeDraft.dirty && !window.confirm("未保存の変更を破棄して移動しますか？")) return false;
    setSelectedEdge(id); return true;
  }
  return <main className="map-workspace">
    <header className="app-header"><Link to="/">Kakudo</Link><h1>学習マップ</h1></header><WorkspaceNav workspaceId={workspaceId} />
    {error && <Feedback error>{error}</Feedback>}
    {refreshFailed && <button className="secondary" disabled={busy} onClick={() => { const recover = retryDisplay.current; if (!recover) return; setBusy(true); void recover().then(() => { setError(""); setRefreshFailed(false); retryDisplay.current = null; }).catch(() => setError("最新の表示を取得できませんでした。接続を確認して再取得してください。")).finally(() => setBusy(false)); }}>最新の表示を再取得</button>}
    <div className="map-layout" aria-busy={busy}>
      <aside className="explorer"><h2>マップ一覧</h2>
        <nav>{maps.map((map) => <Link key={map.id} to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: map.id }} activeProps={{ className: "active-map" }}>{map.title}</Link>)}</nav>
        <form onSubmit={(event) => { event.preventDefault(); void createMap(event.currentTarget); }}>
          <label>新しいマップ（必須）<input name="title" required maxLength={200} disabled={busy} /></label><button disabled={busy}>マップを作成</button>
        </form>
        <Link to="/workspaces/$workspaceId/resources" params={{ workspaceId }}>参考資料</Link><Link to="/workspaces/$workspaceId/reviews" params={{ workspaceId }}>レビュー履歴</Link><Link to="/workspaces/$workspaceId/documents" params={{ workspaceId }}>ノート</Link>
      </aside>
      <section className="map-center">
        {detail && detail.roadmap.id === roadmapId ? <>
          <form className="map-toolbar" onSubmit={(event) => { event.preventDefault(); setMapStatus("保存中…"); void act(async (markCommitted) => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "PATCH", mapDraft.values); markCommitted(); await refresh(); mapDraft.reset(); }).then((saved) => setMapStatus(saved ? "保存しました" : "保存に失敗しました。入力を保持しています。再試行してください。")); }}>
            <label>マップ名（必須）<input name="title" value={mapDraft.values.title} disabled={busy} onChange={(e) => { mapDraft.change("title", e.target.value); setMapStatus(""); }} required maxLength={200} /></label>
            <label>マップの説明（任意）<input name="description" value={mapDraft.values.description} disabled={busy} onChange={(e) => { mapDraft.change("description", e.target.value); setMapStatus(""); }} maxLength={10000} /></label>
            <p role="status">{mapStatus || (mapDraft.dirty ? "未保存の変更" : "保存済み")}</p>
            <button disabled={busy}>マップを保存</button>
            <button type="button" disabled={busy} className="danger" onClick={() => { if (confirm("このマップと学習項目・接続を削除しますか？")) void act(async (markCommitted) => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "DELETE"); markCommitted(); await navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true }); }, async () => { await navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true }); }); }}>マップを削除</button>
          </form>
          <form className="node-create" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async (markCommitted) => { const { node } = await request<{ node: { id: string } }>(`/nodes${scope}`, "POST", { roadmapId, title, ...nextNodePosition(detail.nodes) }); markCommitted(); form.reset(); await refresh(); if (!nodeDraft.dirty && !resourceProtectedRef.current) setSelected(node.id); }); }}>
            <label>新しい学習項目（必須）<input name="title" required maxLength={200} /></label><button disabled={busy}>学習項目を追加</button>
          </form>
          <MapCanvas key={`map:${detail.roadmap.id}`} detail={detail} selected={selected} onSelect={selectNode} busy={busy} selectedEdgeId={selectedEdge} onSelectEdge={selectEdge} edgeDraft={edgeDraft}
            onMove={async (id, x, y) => { await act(async (markCommitted) => { await request(`/nodes/${id}${scope}`, "PATCH", { positionX: x, positionY: y }); markCommitted(); await refresh(); }); }}
            onConnect={async (sourceId, targetId, type, sourceSide, targetSide) => { await act(async (markCommitted) => { await request(`/edges${scope}`, "POST", { roadmapId, sourceId, targetId, type, sourceSide, targetSide }); markCommitted(); await refresh(); }); }}
            onUpdateEdge={(id, sourceSide, targetSide) => act(async (markCommitted) => { await request(`/edges/${id}${scope}`, "PATCH", { sourceSide, targetSide }); markCommitted(); await refresh(); edgeDraft.reset(); })}
            onDeleteEdge={async (id) => { await act(async (markCommitted) => { await request(`/edges/${id}${scope}`, "DELETE"); markCommitted(); await refresh(); }); }} />
        </> : <p className="empty-state">マップを選択するか、新しく作成してください。</p>}
      </section>
      <aside className="node-details">{node ? <><NodeDetails key={node.id} node={node} busy={busy} draft={nodeDraft}
        onSave={(data) => act(async (markCommitted) => { await request(`/nodes/${node.id}${scope}`, "PATCH", data); markCommitted(); await refresh(); nodeDraft.reset(); })}
        onDelete={() => act(async (markCommitted) => { await request(`/nodes/${node.id}${scope}`, "DELETE"); markCommitted(); setSelected(undefined); await refresh(); })} /><NodeDocuments nodeId={node.id} workspaceId={workspaceId} /><ResourcePanel key={`sources:${node.id}`} workspaceId={workspaceId} target={{ kind: "node", id: node.id }} onDraftProtectionChange={setResourceProtected} onChange={() => { void refresh().catch((e) => setError(e.message)); }} /></> : <p>学習項目を選択すると、学習目標と詳細を編集できます。</p>}</aside>
    </div>
  </main>;
}
