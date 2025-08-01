import vn from "@grida/vn";
import { editor } from "@/grida-canvas";
import cmath from "@grida/cmath";
import type grida from "@grida/schema";

export function encodeTranslateVectorCommand(
  network: vn.VectorNetwork,
  selection: Pick<
    editor.state.VectorContentEditMode,
    "selected_vertices" | "selected_segments" | "selected_tangents"
  >
): { vertices: number[]; tangents: [number, 0 | 1][] } {
  const vertexSet = new Set<number>();
  const tangentSet = new Set<string>();

  for (const segIndex of selection.selected_segments) {
    const seg = network.segments[segIndex];
    if (!seg) continue;
    vertexSet.add(seg.a);
    vertexSet.add(seg.b);
  }

  for (const v of selection.selected_vertices) {
    vertexSet.add(v);
  }

  for (const [v, t] of selection.selected_tangents) {
    if (vertexSet.has(v)) continue;
    tangentSet.add(`${v}:${t}`);
  }

  return {
    vertices: Array.from(vertexSet),
    tangents: Array.from(tangentSet).map((s) => {
      const [v, t] = s.split(":");
      return [parseInt(v), Number(t) as 0 | 1];
    }),
  };
}

export function self_updateVectorNode<R>(
  node: grida.program.nodes.VectorNode,
  edit: (vne: vn.VectorNetworkEditor) => R
): R {
  const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
  const bb_a = vne.getBBox();
  const result = edit(vne);
  const bb_b = vne.getBBox();
  const delta: cmath.Vector2 = [bb_b.x - bb_a.x, bb_b.y - bb_a.y];
  vne.translate(cmath.vector2.invert(delta));
  const new_pos = cmath.vector2.add([node.left!, node.top!], delta);

  node.left = new_pos[0];
  node.top = new_pos[1];
  node.width = bb_b.width;
  node.height = bb_b.height;

  node.vectorNetwork = vne.value;

  return result;
}
