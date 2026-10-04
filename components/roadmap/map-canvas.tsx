import { label } from "../../client/labels";
import type { useFormDraft } from "../../client/hooks/use-form-draft";
import { useState } from "react";
import { ReactFlow, Background, Controls, Handle, Position, ConnectionMode, MarkerType, useNodesState, useEdgesState, type NodeProps, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { edgeTypes, edgeSides, type EdgeSide, type RoadmapEdge, type RoadmapDetail } from "../../shared/roadmap";

const sideLabels: Record<EdgeSide, string> = { top: "上", right: "右", bottom: "下", left: "左" };
const positions: Record<EdgeSide, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };
function SideOptions() { return edgeSides.map((side) => <option key={side} value={side}>{sideLabels[side]}</option>); }

type MapNode = Node<{ title: string; status: string; stats: RoadmapDetail["nodes"][number]["stats"] }, "learning">;
function LearningCard({ data }: NodeProps<MapNode>) {
  return <div className="learning-card">{edgeSides.map((side) => <Handle key={side} id={side} type="source" position={positions[side]} className="connection-handle" title={`${sideLabels[side]}の接続点`} aria-label={`${data.title}：${sideLabels[side]}の接続点`} />)}<strong>{data.title}</strong><span>{label(data.status)}</span><small>ノート {data.stats.documents} · 資料 {data.stats.sources}</small><small>未対応の指摘 {data.stats.openFindings}{data.stats.outdatedReviews > 0 ? ` · 更新前 ${data.stats.outdatedReviews}` : ""}</small></div>;
}
const nodeTypes = { learning: LearningCard };
export function MapCanvas({ detail, selected, onSelect, onMove, onConnect, onDeleteEdge, onUpdateEdge, selectedEdgeId, onSelectEdge, edgeDraft, busy }: {
  detail: RoadmapDetail; selected?: string; busy: boolean; onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => Promise<void>;
  onConnect: (source: string, target: string, type: typeof edgeTypes[number], sourceSide: EdgeSide, targetSide: EdgeSide) => Promise<void>;
  onDeleteEdge: (id: string) => Promise<void>;
  onUpdateEdge: (id: string, sourceSide: EdgeSide, targetSide: EdgeSide) => Promise<boolean>;
  edgeDraft: ReturnType<typeof useFormDraft<{ sourceSide: EdgeSide; targetSide: EdgeSide }>>;
  selectedEdgeId?: string; onSelectEdge: (id: string | undefined) => boolean;
}) {
  const [type, setType] = useState<typeof edgeTypes[number]>("PREREQUISITE");
  const mapNodes = (detail: RoadmapDetail): MapNode[] => detail.nodes.map((n) => ({ id: n.id, type: "learning", data: { title: n.title, status: n.status, stats: n.stats }, position: { x: n.positionX, y: n.positionY } }));
  const mapEdges = (detail: RoadmapDetail): Edge[] => detail.edges.map((e) => ({ id: e.id, source: e.sourceId, target: e.targetId, sourceHandle: e.sourceSide, targetHandle: e.targetSide, label: label(e.type), markerEnd: e.type === "RELATED" ? undefined : { type: MarkerType.ArrowClosed }, style: e.type === "RELATED" ? { strokeDasharray: "5 5" } : {} }));
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
  const selectedEdge = detail.edges.find((edge) => edge.id === selectedEdgeId);
  return <>
    <form className="edge-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void onConnect(String(data.get("source")), String(data.get("target")), type, data.get("sourceSide") as EdgeSide, data.get("targetSide") as EdgeSide); }}>
      <div className="connection-end"><label>接続元<select name="source" required>{detail.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><label>出口<select name="sourceSide" defaultValue="bottom"><SideOptions /></select></label></div>
      <div className="connection-end"><label>接続先<select name="target" required>{detail.nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label><label>入口<select name="targetSide" defaultValue="top"><SideOptions /></select></label></div>
      <label>関係<select value={type} onChange={(e) => setType(e.target.value as typeof type)}>{edgeTypes.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></label>
      <button disabled={busy || nodes.length < 2}>接続を追加</button>
    </form>
    {selectedEdge && <EdgePositionEditor key={selectedEdge.id} edge={selectedEdge} draft={edgeDraft} detail={detail} busy={busy} onSave={onUpdateEdge} onClose={() => onSelectEdge(undefined)} />}
    <p className="muted">四辺の丸を別の項目へドラッグすると接続できます。線を選ぶと出口・入口の位置を変更できます。</p><div className="flow-canvas" aria-label="学習マップ">
      <ReactFlow nodes={nodes.map((n) => ({ ...n, selected: n.id === selected }))} edges={edges.map((e) => ({ ...e, selected: e.id === selectedEdgeId }))} onEdgesChange={(changes) => {
        const selection = changes.find((change) => change.type === "select" && change.selected)
          ?? changes.find((change) => change.type === "select" && change.id === selectedEdgeId && !change.selected);
        if (selection?.type === "select" && !onSelectEdge(selection.selected ? selection.id : undefined)) {
          onEdgesChange(changes.filter((change) => change.type !== "select")); return;
        }
        onEdgesChange(changes);
      }}
        ariaLabelConfig={{
          "controls.ariaLabel": "マップの表示操作", "controls.zoomIn.ariaLabel": "拡大", "controls.zoomOut.ariaLabel": "縮小",
          "controls.fitView.ariaLabel": "全体を表示", "controls.interactive.ariaLabel": "操作を切り替え",
          "node.a11yDescription.default": "Enterで項目を選択し、矢印キーで移動できます。Escapeで選択を解除します。",
          "node.a11yDescription.keyboardDisabled": "Enterで項目を選択できます。Escapeで選択を解除します。",
          "node.a11yDescription.ariaLiveMessage": ({ x, y }) => `項目を移動しました。横位置 ${x}、縦位置 ${y}`,
          "edge.a11yDescription.default": "Enterで接続を選択できます。Escapeで選択を解除します。",
          "handle.ariaLabel": "接続点",
        }} connectionMode={ConnectionMode.Loose} isValidConnection={(c) => c.source !== c.target} nodeTypes={nodeTypes} onNodesChange={onNodesChange} nodesDraggable={!busy} nodesConnectable={!busy} deleteKeyCode={null}
        onNodeClick={(_e, n) => onSelect(n.id)} onNodeDragStop={(_e, n) => { void onMove(n.id, n.position.x, n.position.y); }}
        onConnect={(c) => { if (c.source && c.target) void onConnect(c.source, c.target, type, c.sourceHandle as EdgeSide, c.targetHandle as EdgeSide); }} fitView minZoom={0.2} maxZoom={2}>
        <Background /><Controls />
      </ReactFlow>
    </div>
    <details><summary>接続一覧 ({detail.edges.length})</summary>{detail.edges.map((e) => <div className="edge-row" key={e.id}><span>{detail.nodes.find((n) => n.id === e.sourceId)?.title} → {detail.nodes.find((n) => n.id === e.targetId)?.title} ({label(e.type)})</span><span className="edge-row-actions"><button className="secondary" disabled={busy} onClick={() => onSelectEdge(e.id)}>接続位置を変更</button><button className="danger" disabled={busy} onClick={() => { void onDeleteEdge(e.id); }}>接続を削除</button></span></div>)}</details>
  </>;
}

function EdgePositionEditor({ edge, detail, draft, busy, onSave, onClose }: {
  edge: RoadmapEdge; detail: RoadmapDetail; busy: boolean;
  draft: ReturnType<typeof useFormDraft<{ sourceSide: EdgeSide; targetSide: EdgeSide }>>;
  onSave: (id: string, sourceSide: EdgeSide, targetSide: EdgeSide) => Promise<boolean>; onClose: () => void;
}) {
  const [status, setStatus] = useState("");
  return <form className="edge-position-editor" aria-label="接続位置の編集" onSubmit={(event) => {
    event.preventDefault(); setStatus("保存中…");
    void onSave(edge.id, draft.values.sourceSide, draft.values.targetSide).then((saved) => setStatus(saved ? "保存しました" : "保存に失敗しました。入力を保持しています。再試行してください。"));
  }}>
    <div className="edge-position-heading"><h2>接続位置を変更</h2><button type="button" className="secondary" disabled={busy} onClick={onClose}>閉じる</button></div>
    <p>{detail.nodes.find((node) => node.id === edge.sourceId)?.title} → {detail.nodes.find((node) => node.id === edge.targetId)?.title}（{label(edge.type)}）</p>
    <p role="status">{status || (draft.dirty ? "未保存の変更" : "保存済み")}</p>
    <div className="edge-position-fields">
      <label>出口の位置<select name="sourceSide" value={draft.values.sourceSide} disabled={busy} onChange={(e) => { draft.change("sourceSide", e.target.value); setStatus(""); }}><SideOptions /></select></label>
      <label>入口の位置<select name="targetSide" value={draft.values.targetSide} disabled={busy} onChange={(e) => { draft.change("targetSide", e.target.value); setStatus(""); }}><SideOptions /></select></label>
      <button disabled={busy}>接続位置を保存</button>
    </div>
  </form>;
}
