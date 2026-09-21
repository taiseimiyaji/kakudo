import { nextNodePosition } from "../../modules/roadmap/layout";
import { ResourcePanel } from "../../components/resources/resource-panel";
import { NodeDocuments } from "../../components/editor/node-documents";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { request } from "../api";
import { roadmapDetailSchema, roadmapSchema, type RoadmapDetail, type Roadmap } from "../../shared/roadmap";
import { MapCanvas } from "../../components/roadmap/map-canvas";
import { NodeDetails } from "../../components/roadmap/node-details";

export default function RoadmapPage() {
  const { workspaceId = "default", roadmapId } = useParams({ strict: false });
  return <RoadmapEditor key={`${workspaceId}:${roadmapId ?? ""}`} />;
}

function RoadmapEditor() {
  const { workspaceId = "default", roadmapId } = useParams({ strict: false });
  const navigate = useNavigate();
  const scope = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [maps, setMaps] = useState<Roadmap[]>([]);
  const [detail, setDetail] = useState<RoadmapDetail | null>(null);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loadGeneration = useRef(0);
  const load = useCallback(async (refreshMap = true) => {
    const generation = ++loadGeneration.current;
    const list = z.object({ roadmaps: z.array(roadmapSchema) }).parse(await request(`/roadmaps${scope}`));
    const result = refreshMap && roadmapId ? roadmapDetailSchema.parse(await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`)) : null;
    if (generation === loadGeneration.current) {
      setMaps(list.roadmaps);
      if (refreshMap) setDetail(result);
    }
  }, [scope, roadmapId]);
  useEffect(() => {
    let active = true;
    const generation = loadGeneration;
    void Promise.resolve().then(() => { if (active) return load(); }).catch((e) => { if (active) setError((e as Error).message); });
    return () => { active = false; generation.current++; };
  }, [load]);

  async function act(work: () => Promise<void>, refreshMap = true) {
    ++loadGeneration.current;
    setBusy(true); setError("");
    try {
      await work();
      await load(refreshMap);
    } catch (e) {
      setError((e as Error).message);
      // Roll back optimistic positions, then reconcile ambiguous network failures.
      setDetail((current) => current ? { ...current } : current);
      if (refreshMap) {
        try { await load(); }
        catch { setError(`${(e as Error).message} サーバーの最新状態を確認できません。接続を確認して再読み込みしてください。`); }
      }
    } finally { setBusy(false); }
  }
  const node = detail?.nodes.find((n) => n.id === selected);
  return <main className="map-workspace">
    <header className="app-header"><Link to="/">Kakudo</Link><h1>Knowledge Map</h1><Link to="/workspaces/$workspaceId" params={{ workspaceId }}>Workspace</Link></header>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="map-layout" aria-busy={busy}>
      <aside className="explorer"><h2>Roadmaps</h2>
        <nav>{maps.map((map) => <Link key={map.id} to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: map.id }} onClick={() => { if (map.id !== roadmapId) { setDetail(null); setSelected(undefined); } }} activeProps={{ className: "active-map" }}>{map.title}</Link>)}</nav>
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async () => { const { roadmap } = await request<{ roadmap: Roadmap }>(`/roadmaps${scope}`, "POST", { title }); form.reset(); await navigate({ to: "/workspaces/$workspaceId/roadmaps/$roadmapId", params: { workspaceId, roadmapId: roadmap.id } }); }, false); }}>
          <label>新しいRoadmap<input name="title" required maxLength={200} /></label><button disabled={busy}>Roadmapを作成</button>
        </form>
        <Link to="/workspaces/$workspaceId/resources" params={{ workspaceId }}>Resources</Link><Link to="/workspaces/$workspaceId/reviews" params={{ workspaceId }}>Reviews</Link><Link to="/workspaces/$workspaceId/documents" params={{ workspaceId }}>Documents</Link>
      </aside>
      <section className="map-center">
        {detail && detail.roadmap.id === roadmapId ? <>
          <form key={`toolbar:${detail.roadmap.id}`} className="map-toolbar" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(async () => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "PATCH", { title: form.get("title"), description: form.get("description") }); }); }}>
            <label>Roadmap名<input name="title" defaultValue={detail.roadmap.title} required maxLength={200} /></label>
            <label>Roadmapの説明<input name="description" defaultValue={detail.roadmap.description} /></label>
            <button disabled={busy}>Roadmapを保存</button>
            <button type="button" disabled={busy} className="danger" onClick={() => { if (confirm("このRoadmapとNode・Edgeを削除しますか？")) void act(async () => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "DELETE"); setDetail(null); await navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId } }); }, false); }}>Roadmapを削除</button>
          </form>
          <form className="node-create" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async () => { const { node } = await request<{ node: { id: string } }>(`/nodes${scope}`, "POST", { roadmapId, title, ...nextNodePosition(detail.nodes) }); setSelected(node.id); form.reset(); }); }}>
            <label>新しいNode<input name="title" required maxLength={200} /></label><button disabled={busy}>Nodeを追加</button>
          </form>
          <MapCanvas key={`map:${detail.roadmap.id}`} detail={detail} selected={selected} onSelect={setSelected} busy={busy}
            onMove={(id, x, y) => act(async () => { await request(`/nodes/${id}${scope}`, "PATCH", { positionX: x, positionY: y }); })}
            onConnect={(sourceId, targetId, type) => act(async () => { await request(`/edges${scope}`, "POST", { roadmapId, sourceId, targetId, type }); })}
            onDeleteEdge={(id) => act(async () => { await request(`/edges/${id}${scope}`, "DELETE"); })} />
        </> : <p className="empty-state">Roadmapを選択するか、新しく作成してください。</p>}
      </section>
      <aside className="node-details">{node ? <><NodeDetails key={node.id} node={node} busy={busy}
        onSave={async (data) => { await act(async () => { await request(`/nodes/${node.id}${scope}`, "PATCH", data); }); }}
        onDelete={async () => { await act(async () => { await request(`/nodes/${node.id}${scope}`, "DELETE"); setSelected(undefined); }); }} /><NodeDocuments nodeId={node.id} workspaceId={workspaceId} /><ResourcePanel key={`sources:${node.id}`} workspaceId={workspaceId} target={{ kind: "node", id: node.id }} onChange={() => { void load().catch((e) => setError((e as Error).message)); }} /></> : <p>Nodeを選択すると、学習目標と詳細を編集できます。</p>}</aside>
    </div>
  </main>;
}
