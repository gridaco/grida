import cmath from "@grida/cmath";
export interface GeoNode {
  id: string;
  bounds: cmath.Rectangle;
  children?: GeoNode[];
}

export type HitTestingMode = "contains" | "intersects";

type Envelope = cmath.Vector2 | cmath.Rectangle;

function isHit(
  rect: cmath.Rectangle,
  envelope: Envelope,
  mode: HitTestingMode
): boolean {
  if (Array.isArray(envelope)) {
    return cmath.rect.containsPoint(rect, envelope);
  }
  return mode === "contains"
    ? cmath.rect.contains(envelope, rect)
    : cmath.rect.intersects(rect, envelope);
}

export function getDeepest(
  tree: GeoNode,
  envelope: Envelope,
  mode: HitTestingMode = "intersects"
): GeoNode | null {
  function dfs(node: GeoNode, depth: number): { node: GeoNode; depth: number } | null {
    if (!isHit(node.bounds, envelope, mode)) {
      return null;
    }
    let deepest: { node: GeoNode; depth: number } = { node, depth };
    for (const child of node.children ?? []) {
      const hit = dfs(child, depth + 1);
      if (hit && hit.depth > deepest.depth) {
        deepest = hit;
      }
    }
    return deepest;
  }
  const result = dfs(tree, 0);
  return result ? result.node : null;
}
