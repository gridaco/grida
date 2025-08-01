import vn from "@grida/vn";
import { editor } from "@/grida-canvas";

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
