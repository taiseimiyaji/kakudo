import { NodeDocuments } from "../../components/editor/node-documents";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { z } from "zod";
import { request } from "../api";
import { roadmapDetailSchema, roadmapSchema, type RoadmapDetail, type Roadmap } from "../../shared/roadmap";
import { MapCanvas } from "../../components/roadmap/map-canvas";
import { NodeDetails } from "../../components/roadmap/node-details";

export default function RoadmapPage() {
  const { workspaceId = "default", roadmapId } = useParams({ strict: false });
  const navigate = useNavigate();
  const scope = `?workspaceId=${encodeURIComponent(workspaceId)}`;
  const [maps, setMaps] = useState<Roadmap[]>([]);
  const [detail, setDetail] = useState<RoadmapDetail | null>(null);
  const [selected, setSelected] = useState<string>();
  const [version, setVersion] = useState(0);
  const [loadedVersion, setLoadedVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const list = z.object({ roadmaps: z.array(roadmapSchema) }).parse(await request(`/roadmaps${scope}`));
        const result = roadmapId ? roadmapDetailSchema.parse(await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`)) : null;
        if (active) { setMaps(list.roadmaps); setDetail(result); setLoadedVersion(version); }
      } catch (e) { if (active) setError((e as Error).message); }
    }
    void load();
    return () => { active = false; };
  }, [scope, roadmapId, version]);

  async function act(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); setVersion((v) => v + 1); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const node = detail?.nodes.find((n) => n.id === selected);
  return <main className="map-workspace">
    <header className="app-header"><Link to="/">Kakudo</Link><h1>Knowledge Map</h1><Link to="/workspaces/$workspaceId" params={{ workspaceId }}>Workspace</Link></header>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="map-layout" aria-busy={busy}>
      <aside className="explorer"><h2>Roadmaps</h2>
        <nav>{maps.map((map) => <Link key={map.id} to="/workspaces/$workspaceId/roadmaps/$roadmapId" params={{ workspaceId, roadmapId: map.id }} onClick={() => { if (map.id !== roadmapId) { setDetail(null); setSelected(undefined); } }} activeProps={{ className: "active-map" }}>{map.title}</Link>)}</nav>
        <form onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async () => { const { roadmap } = await request<{ roadmap: Roadmap }>(`/roadmaps${scope}`, "POST", { title }); form.reset(); await navigate({ to: "/workspaces/$workspaceId/roadmaps/$roadmapId", params: { workspaceId, roadmapId: roadmap.id } }); }); }}>
          <label>新しいRoadmap<input name="title" required maxLength={200} /></label><button disabled={busy}>Roadmapを作成</button>
        </form>
        <p className="muted">Documents / Sources / Reviewsは後続の実装です。</p>
      </aside>
      <section className="map-center">
        {detail && detail.roadmap.id === roadmapId ? <>
          <form key={`toolbar:${detail.roadmap.id}:${loadedVersion}`} className="map-toolbar" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void act(async () => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "PATCH", { title: form.get("title"), description: form.get("description") }); }); }}>
            <label>Roadmap名<input name="title" defaultValue={detail.roadmap.title} required maxLength={200} /></label>
            <label>Roadmapの説明<input name="description" defaultValue={detail.roadmap.description} /></label>
            <button disabled={busy}>Roadmapを保存</button>
            <button type="button" disabled={busy} className="danger" onClick={() => { if (confirm("このRoadmapとNode・Edgeを削除しますか？")) void act(async () => { await request(`/roadmaps/${encodeURIComponent(roadmapId)}${scope}`, "DELETE"); setDetail(null); await navigate({ to: "/workspaces/$workspaceId/roadmaps", params: { workspaceId } }); }); }}>Roadmapを削除</button>
          </form>
          <form className="node-create" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const title = String(new FormData(form).get("title")); void act(async () => { const { node } = await request<{ node: { id: string } }>(`/nodes${scope}`, "POST", { roadmapId, title, positionX: detail.nodes.length * 60, positionY: detail.nodes.length * 80 }); setSelected(node.id); form.reset(); }); }}>
            <label>新しいNode<input name="title" required maxLength={200} /></label><button disabled={busy}>Nodeを追加</button>
          </form>
          <MapCanvas key={`map:${detail.roadmap.id}:${loadedVersion}`} detail={detail} selected={selected} onSelect={setSelected} busy={busy}
            onMove={(id, x, y) => act(async () => { await request(`/nodes/${id}${scope}`, "PATCH", { positionX: x, positionY: y }); })}
            onConnect={(sourceId, targetId, type) => act(async () => { await request(`/edges${scope}`, "POST", { roadmapId, sourceId, targetId, type }); })}
            onDeleteEdge={(id) => act(async () => { await request(`/edges/${id}${scope}`, "DELETE"); })} />
        </> : <p className="empty-state">Roadmapを選択するか、新しく作成してください。</p>}
      </section>
      <aside className="node-details">{node ? <><NodeDetails key={`${node.id}:${loadedVersion}`} node={node} busy={busy}
        onSave={(data) => act(async () => { await request(`/nodes/${node.id}${scope}`, "PATCH", data); })}
        onDelete={() => act(async () => { await request(`/nodes/${node.id}${scope}`, "DELETE"); setSelected(undefined); })} /><NodeDocuments nodeId={node.id} workspaceId={workspaceId} /></> : <p>Nodeを選択すると、学習目標と詳細を編集できます。</p>}</aside>
    </div>
  </main>;
}
