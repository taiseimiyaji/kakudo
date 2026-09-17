export function nextNodePosition(nodes: { positionY: number }[]) {
  return { positionX: 40, positionY: nodes.length ? Math.max(...nodes.map((node) => node.positionY)) + 220 : 0 };
}
