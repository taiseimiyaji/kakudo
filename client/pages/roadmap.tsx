import { Feedback } from "../../components/common/feedback";
import { nextNodePosition } from "../../modules/roadmap/layout";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { NodeDocuments } from "../../components/editor/node-documents";
import { useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { request } from "../api";
import { roadmapDetailSchema, roadmapSchema, type RoadmapDetail, type Roadmap } from "../../shared/roadmap";
import { MapCanvas } from "../../components/roadmap/map-canvas";
import { useFormDraft } from "../hooks/use-form-draft";
import { NodeDetails, nodeFormValues } from "../../components/roadmap/node-details";

export default function RoadmapPage() {
  const { workspaceId, roadmapId } = useParams({ strict: false });
  return <RoadmapSession key={`${workspaceId}:${roadmapId}`} />;
}
function RoadmapSession() {
  const { workspaceId = "default", roadmapId } = useParams({ strict: false });
  const navigate = useNavigate();
  const scope = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [maps, setMaps] = useState<Roadmap[]>([]);
  const [detail, setDetail] = useState<RoadmapDetail | null>(null);
  const [selected, setSelected] = useState<string>();
  const [mapStatus, setMapStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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

  async function act(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); return true; } catch (e) {
      setError((e as Error).message);
      // Roll back optimistic positions, then reconcile writes whose response was lost.
      setDetail((current) => current ? { ...current } : current);
      if (roadmapId) {
        try { await refresh(); }
        catch { setError(`${(e as Error).message} サーバーの最新状態を確認できません。接続を確認して再読み込みしてください。`); }
      }
      return false;
    }
    finally { setBusy(false); }
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
  const dirty = mapDraft.dirty || nodeDraft.dirty;
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm("未保存の変更を破棄して移動しますか？"), enableBeforeUnload: dirty });
  function selectNode(id: string) {
    if (id === selected || busy) return;
    if (nodeDraft.dirty && !window.confirm("未保存の変更を破棄して移動しますか？")) return;
    setSelected(id);
  }
  return <main className="map-workspace">
    <header className="app-header"><Link to="/">Kakudo</Link><h1>Knowledge Map</h1><Link to="/workspaces/$workspaceId" params={{ workspaceId }}>Workspace</Link></header>
    {error && <Feedback error>{error}</Feedback>}
    <div className="map-layout" aria-busy={busy}>
      <aside className="explorer"><h2>Roadmaps</h2>
        <nav>{maps.map((map) => <Link key={map.id} to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: map.id }} activeProps={{ className: "active-map" }}>{map.title}</Link>)}</nav>
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async () => { const { roadmap } = await request<{ roadmap: Roadmap }>(`/roadmaps${scope}`, "POST", { title }); setMaps((current) => [...current, roadmap]); form.reset(); await navigate({ to: "/workspaces/$workspaceId/roadmaps/$roadmapId", params: { workspaceId, roadmapId: roadmap.id } }); }); }}>
          <label>新しいRoadmap<input name="title" required maxLength={200} /></label><button disabled={busy}>Roadmapを作成</button>
        </form>
        <Link to="/workspaces/$workspaceId/resources" params={{ workspaceId }}>Resources</Link><Link to="/workspaces/$workspaceId/reviews" params={{ workspaceId }}>Reviews</Link><Link to="/workspaces/$workspaceId/documents" params={{ workspaceId }}>Documents</Link>
      </aside>
      <section className="map-center">
        {detail && detail.roadmap.id === roadmapId ? <>
          <form className="map-toolbar" onSubmit={(event) => { event.preventDefault(); setMapStatus("保存中…"); void act(async () => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "PATCH", mapDraft.values); await refresh(); mapDraft.reset(); }).then((saved) => setMapStatus(saved ? "保存しました" : "保存に失敗しました。入力を保持しています。再試行してください。")); }}>
            <label>Roadmap名<input name="title" value={mapDraft.values.title} disabled={busy} onChange={(e) => { mapDraft.change("title", e.target.value); setMapStatus(""); }} required maxLength={200} /></label>
            <label>Roadmapの説明<input name="description" value={mapDraft.values.description} disabled={busy} onChange={(e) => { mapDraft.change("description", e.target.value); setMapStatus(""); }} maxLength={10000} /></label>
            <p role="status">{mapStatus || (mapDraft.dirty ? "未保存の変更" : "保存済み")}</p>
            <button disabled={busy}>Roadmapを保存</button>
            <button type="button" disabled={busy} className="danger" onClick={() => { if (confirm("このRoadmapとNode・Edgeを削除しますか？")) void act(async () => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "DELETE"); await navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId }, ignoreBlocker: true }); }); }}>Roadmapを削除</button>
          </form>
          <form className="node-create" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async () => { const { node } = await request<{ node: { id: string } }>(`/nodes${scope}`, "POST", { roadmapId, title, ...nextNodePosition(detail.nodes) }); await refresh(); if (!nodeDraft.dirty) setSelected(node.id); form.reset(); }); }}>
            <label>新しいNode<input name="title" required maxLength={200} /></label><button disabled={busy}>Nodeを追加</button>
          </form>
          <MapCanvas key={`map:${detail.roadmap.id}`} detail={detail} selected={selected} onSelect={selectNode} busy={busy}
            onMove={async (id, x, y) => { await act(async () => { await request(`/nodes/${id}${scope}`, "PATCH", { positionX: x, positionY: y }); await refresh(); }); }}
            onConnect={async (sourceId, targetId, type) => { await act(async () => { await request(`/edges${scope}`, "POST", { roadmapId, sourceId, targetId, type }); await refresh(); }); }}
            onDeleteEdge={async (id) => { await act(async () => { await request(`/edges/${id}${scope}`, "DELETE"); await refresh(); }); }} />
        </> : <p className="empty-state">Roadmapを選択するか、新しく作成してください。</p>}
      </section>
      <aside className="node-details">{node ? <><NodeDetails key={node.id} node={node} busy={busy} draft={nodeDraft}
        onSave={(data) => act(async () => { await request(`/nodes/${node.id}${scope}`, "PATCH", data); await refresh(); nodeDraft.reset(); })}
        onDelete={() => act(async () => { await request(`/nodes/${node.id}${scope}`, "DELETE"); setSelected(undefined); await refresh(); })} /><NodeDocuments nodeId={node.id} workspaceId={workspaceId} /><ResourcePanel key={`sources:${node.id}`} workspaceId={workspaceId} target={{ kind: "node", id: node.id }} onChange={() => { void refresh().catch((e) => setError(e.message)); }} /></> : <p>Nodeを選択すると、学習目標と詳細を編集できます。</p>}</aside>
    </div>
  </main>;
}
