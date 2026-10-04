import { BaseEdge, EdgeLabelRenderer, getBezierPath, useInternalNode, type Edge, type EdgeProps } from "@xyflow/react";
import type { EdgeLabelSlot } from "../../modules/roadmap/edge-labels";

export type ParallelEdgeData = EdgeLabelSlot & { route: string; relation: string; busy: boolean; select: (id: string | undefined) => boolean };
export type ParallelFlowEdge = Edge<ParallelEdgeData>;

export function ParallelEdge({ id, source, target, data, selected, markerEnd, markerStart, style, interactionWidth, ...position }: EdgeProps<ParallelFlowEdge>) {
  const sourceNode = useInternalNode(source); const targetNode = useInternalNode(target);
  const [path, midpointX, midpointY] = getBezierPath(position);
  if (!data) return <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} interactionWidth={interactionWidth} />;
  // All handle configurations for this pair share a label center. Paths remain exact.
  const center = (node: typeof sourceNode, axis: "x" | "y") => node
    ? node.internals.positionAbsolute[axis] + (node.measured[axis === "x" ? "width" : "height"] ?? 0) / 2 : undefined;
  const sx = center(sourceNode, "x"); const sy = center(sourceNode, "y"); const tx = center(targetNode, "x"); const ty = center(targetNode, "y");
  const x = sx === undefined || tx === undefined ? midpointX : (sx + tx) / 2;
  const y = (sy === undefined || ty === undefined ? midpointY : (sy + ty) / 2) + data.offset * 44;
  const caption = `${data.route}（${data.relation}）`;
  return <>
    <BaseEdge id={id} path={path} markerEnd={markerEnd} markerStart={markerStart} style={style} interactionWidth={interactionWidth} />
    <EdgeLabelRenderer><button type="button" className="parallel-edge-label nodrag nopan" data-edge-label={id} aria-label={caption} title={caption} aria-pressed={!!selected} disabled={data.busy}
      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
      onClick={(event) => { event.stopPropagation(); data.select(id); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); data.select(undefined); } }}>
      <span className="parallel-edge-route">{data.route}</span><span>{data.relation}</span>
    </button></EdgeLabelRenderer>
  </>;
}
