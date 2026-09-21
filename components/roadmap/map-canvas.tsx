import { useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, MarkerType, useNodesState, useEdgesState, type NodeProps, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { edgeTypes, type RoadmapDetail } from "../../shared/roadmap";

type MapNode = Node<{ title: string; status: string; stats: RoadmapDetail["nodes"][number]["stats"] }, "learning">;
function LearningCard({ data }: NodeProps<MapNode>) {
  return <div className="learning-card"><Handle type="target" position={Position.Top} /><strong>{data.title}</strong><span>{data.status}</span><small>Docs {data.stats.documents} · Sources {data.stats.sources}</small><small>Review ⚠ {data.stats.openFindings}{data.stats.outdatedReviews > 0 ? ` · Outdated ${data.stats.outdatedReviews}` : ""}</small><Handle type="source" position={Position.Bottom} /></div>;
}
const nodeTypes = { learning: LearningCard };
export function MapCanvas({ detail, selected, onSelect, onMove, onConnect, onDeleteEdge, busy }: {
  detail: RoadmapDetail; selected?: string; busy: boolean; onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => Promise<void>;
  onConnect: (source: string, target: string, type: typeof edgeTypes[number]) => Promise<void>;
  onDeleteEdge: (id: string) => Promise<void>;
}) {
  const [type, setType] = useState<typeof edgeTypes[number]>("PREREQUISITE");
  const mapNodes = (detail: RoadmapDetail): MapNode[] => detail.nodes.map((n) => ({ id: n.id, type: "learning", data: { title: n.title, status: n.status, stats: n.stats }, position: { x: n.positionX, y: n.positionY } }));
  const mapEdges = (detail: RoadmapDetail) => detail.edges.map((e) => ({ id: e.id, source: e.sourceId, target: e.targetId, label: e.type, markerEnd: e.type === "RELATED" ? undefined : { type: MarkerType.ArrowClosed }, style: e.type === "RELATED" ? { strokeDasharray: "5 5" } : {} }));
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(mapNodes(detail));
  const [edges, setEdges, onEdgesChange] = useEdgesState(mapEdges(detail));
  const [previousDetail, setPreviousDetail] = useState(detail);
  // Reconcile server data without replacing the React Flow instance or its viewport.
  if (previousDetail !== detail) {
    setPreviousDetail(detail);
    setNodes(mapNodes(detail).map((node) => {
      const old = nodes.find((current) => current.id === node.id);
      return { ...old, ...node, position: old?.dragging ? old.position : node.position };
    }));
    setEdges(mapEdges(detail).map((edge) => ({ ...edges.find((old) => old.id === edge.id), ...edge })));
  }
  return <>
    <form className="edge-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onConnect(String(data.get("source")), String(data.get("target")), type); }}>
      <label>接続元<select name="source" required>{detail.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
      <label>接続先<select name="target" required>{detail.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
      <label>関係<select value={type} onChange={(e) => setType(e.target.value as typeof type)}>{edgeTypes.map((v) => <option key={v}>{v}</option>)}</select></label>
      <button disabled={busy || nodes.length < 2}>接続を追加</button>
    </form>
    <div className="flow-canvas" aria-label="学習マップ">
      <ReactFlow nodes={nodes.map((n) => ({ ...n, selected: n.id === selected }))} edges={edges} onEdgesChange={onEdgesChange}
        ariaLabelConfig={{ "controls.fitView.ariaLabel": "全体を表示", "controls.zoomIn.ariaLabel": "拡大", "controls.zoomOut.ariaLabel": "縮小", "controls.interactive.ariaLabel": "操作を切り替え" }} nodeTypes={nodeTypes} onNodesChange={onNodesChange} nodesDraggable={!busy} nodesConnectable={!busy} deleteKeyCode={null}
        onNodeClick={(_e, n) => onSelect(n.id)} onNodeDragStop={(_e, n) => { void onMove(n.id, n.position.x, n.position.y); }}
        onConnect={(c) => { if (c.source && c.target) void onConnect(c.source, c.target, type); }} fitView minZoom={0.2} maxZoom={2}>
        <Background /><Controls aria-label="マップ表示操作" />
      </ReactFlow>
    </div>
    <details><summary>接続一覧 ({detail.edges.length})</summary>{detail.edges.map((e) => <div className="edge-row" key={e.id}><span>{detail.nodes.find((n) => n.id === e.sourceId)?.title} → {detail.nodes.find((n) => n.id === e.targetId)?.title} ({e.type})</span><button disabled={busy} onClick={() => { void onDeleteEdge(e.id); }}>接続を削除</button></div>)}</details>
  </>;
}
