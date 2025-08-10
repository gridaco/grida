import type { Draft } from "immer";
import vn from "@grida/vn";
import { editor } from "@/grida-canvas";
import cmath from "@grida/cmath";
import type grida from "@grida/schema";
import { dq } from "@/grida-canvas/query";
import assert from "assert";
import type { ReducerContext } from "..";

/**
 * Collects the vertices and tangents that need translation for the provided
 * selection.
 *
 * Segment endpoints are added automatically. Tangent handles are ignored when
 * their associated vertex is already included.
 *
 * @param network - Vector network containing the geometry.
 * @param selection - Selected vertices, segments and tangents.
 * @returns The vertex and tangent indices that should be moved.
 */
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

/**
 * Calculates the list of active vertices based on the current selection.
 *
 * Selected vertices are always included. When a tangent or segment is
 * selected, its related vertex endpoints are considered active as well. The
 * previous and next vertices of each active vertex are also added to the
 * result.
 *
 * @param network - Vector network containing the geometry.
 * @param selection - Selected vertices, segments and tangents.
 * @returns Array of unique vertex indices considered active.
 */
export function getUXNeighbouringVertices(
  network: vn.VectorNetwork,
  selection: Pick<
    editor.state.VectorContentEditMode,
    "selected_vertices" | "selected_segments" | "selected_tangents"
  >
): number[] {
  const active = new Set<number>();

  for (const v of selection.selected_vertices) {
    active.add(v);
  }

  for (const [v] of selection.selected_tangents) {
    active.add(v);
  }

  for (const segIndex of selection.selected_segments) {
    const seg = network.segments[segIndex];
    if (!seg) continue;
    active.add(seg.a);
    active.add(seg.b);
  }

  const vne = new vn.VectorNetworkEditor(network);
  const neighbours = new Set<number>(active);
  for (const v of active) {
    for (const n of vne.getNeighboringVerticies(v)) {
      neighbours.add(n);
    }
  }

  return Array.from(neighbours).sort((a, b) => a - b);
}

/**
 * Applies a mutation to a vector node using a `VectorNetworkEditor` and updates
 * the node's bounding box and position.
 *
 * The editor callback can freely modify the network. After the edit completes,
 * the node's dimensions and position are synchronized with the new bounding box
 * while the network itself is shifted back to preserve its local origin.
 *
 * @template R - Return type of the edit callback.
 * @param node - The vector node to update.
 * @param edit - Callback that performs edits on the network editor.
 * @returns The value returned by the `edit` callback.
 */
export function self_updateVectorNodeVectorNetwork<R>(
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

/**
 * Normalizes a vector node so that its vector network starts at the origin
 * (0,0) and the node's position reflects the network's real bounding box.
 *
 * The network is translated by the negative offset of its bounding box and the
 * node's `left` and `top` are increased by the same amount. The node's size is
 * updated to match the bounding box dimensions.
 *
 * @param node - Vector node to normalize.
 * @returns The translation delta applied to the node `[dx, dy]`.
 */
export function normalizeVectorNodeBBox(
  node: grida.program.nodes.VectorNode
): cmath.Vector2 {
  const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
  const bb = vne.getBBox();
  const delta: cmath.Vector2 = [bb.x, bb.y];
  vne.translate(cmath.vector2.invert(delta));

  node.left = (node.left ?? 0) + delta[0];
  node.top = (node.top ?? 0) + delta[1];
  node.width = bb.width;
  node.height = bb.height;
  node.vectorNetwork = vne.value;

  return delta;
}

export function self_updateVectorAreaSelection<
  S extends editor.state.IEditorState,
>(
  draft: Draft<S>,
  context: ReducerContext,
  predicate: (point: cmath.Vector2) => boolean,
  additive: boolean,
  rect?: cmath.Rectangle
): void {
  assert(draft.content_edit_mode?.type === "vector");
  const { node_id, selection_neighbouring_vertices: neighbouring_vertices } =
    draft.content_edit_mode;
  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;
  const node_rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
  const vne = new vn.VectorNetworkEditor(node.vectorNetwork);

  const verts = vne.getVerticesAbsolute([node_rect.x, node_rect.y]);
  let selected_vertices = verts
    .map((p, i) => (predicate(p) ? i : -1))
    .filter((i) => i !== -1);
  if (additive) {
    const vset = new Set([
      ...draft.content_edit_mode.selected_vertices,
      ...selected_vertices,
    ]);
    selected_vertices = Array.from(vset);
  }
  const selected_vertex_set = new Set(selected_vertices);

  const control_points = vne
    .getControlPointsAbsolute([node_rect.x, node_rect.y])
    .filter(({ segment, control }) => {
      const vert =
        control === "ta"
          ? node.vectorNetwork.segments[segment].a
          : node.vectorNetwork.segments[segment].b;
      return neighbouring_vertices.includes(vert);
    });
  let selected_tangents = control_points
    .filter(({ point }) => predicate(point))
    .map(({ segment, control }) => [
      control === "ta"
        ? node.vectorNetwork.segments[segment].a
        : node.vectorNetwork.segments[segment].b,
      control === "ta" ? 0 : 1,
    ]) as [number, 0 | 1][];

  const offset: cmath.Vector2 = [node_rect.x, node_rect.y];
  let selected_segments: number[] = [];
  if (rect) {
    selected_segments = node.vectorNetwork.segments
      .map((seg, i) => {
        const va = cmath.vector2.add(
          node.vectorNetwork.vertices[seg.a],
          offset
        );
        const vb = cmath.vector2.add(
          node.vectorNetwork.vertices[seg.b],
          offset
        );
        return cmath.bezier.intersectsRect(va, vb, seg.ta, seg.tb, rect)
          ? i
          : -1;
      })
      .filter((i) => i !== -1);
    if (additive) {
      const sset = new Set([
        ...draft.content_edit_mode.selected_segments,
        ...selected_segments,
      ]);
      selected_segments = Array.from(sset);
    }
  } else {
    selected_segments = additive
      ? draft.content_edit_mode.selected_segments
      : [];
  }

  // vertex selection has higher priority than segments –
  // any segment touching a selected vertex is dropped
  // from the selection unless the segment is fully contained by the marquee.
  selected_segments = selected_segments.filter((i) => {
    const seg = node.vectorNetwork.segments[i];
    const va = cmath.vector2.add(node.vectorNetwork.vertices[seg.a], offset);
    const vb = cmath.vector2.add(node.vectorNetwork.vertices[seg.b], offset);
    const contained = rect
      ? cmath.bezier.containedByRect(va, vb, seg.ta, seg.tb, rect)
      : false;
    return (
      contained ||
      (!selected_vertex_set.has(seg.a) && !selected_vertex_set.has(seg.b))
    );
  });

  if (additive) {
    const key = (t: [number, 0 | 1]) => `${t[0]}:${t[1]}`;
    const tset = new Set(draft.content_edit_mode.selected_tangents.map(key));
    for (const t of selected_tangents) tset.add(key(t));
    selected_tangents = Array.from(tset).map((s) => {
      const [v, t] = s.split(":");
      return [parseInt(v), Number(t) as 0 | 1];
    });
  }

  draft.content_edit_mode.selected_vertices = selected_vertices;
  draft.content_edit_mode.selected_segments = selected_segments;
  draft.content_edit_mode.selected_tangents = selected_tangents;
  draft.content_edit_mode.selection_neighbouring_vertices =
    getUXNeighbouringVertices(node.vectorNetwork, {
      selected_vertices,
      selected_segments,
      selected_tangents,
    });
  draft.content_edit_mode.a_point =
    selected_vertices.length > 0
      ? selected_vertices[0]
      : selected_segments.length > 0
        ? node.vectorNetwork.segments[selected_segments[0]].a
        : selected_tangents.length > 0
          ? selected_tangents[0][0]
          : null;
}

/**
 * Optimizes the vector network of the currently edited vector node, merging
 * duplicated vertices and segments and optionally removing unused vertices.
 */
export function self_optimizeVectorNetwork(
  draft: Draft<editor.state.IEditorState>
) {
  if (draft.content_edit_mode?.type !== "vector") return;
  const { node_id } = draft.content_edit_mode;
  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;
  const vne = new vn.VectorNetworkEditor(node.vectorNetwork);
  node.vectorNetwork = vne.optimize(
    editor.config.DEFAULT_VECTOR_OPTIMIZATION_CONFIG
  );
}

/**
 * Updates the hovered segment index in vector content edit mode.
 *
 * This method manages the UI-triggered hover state for segments in vector edit mode.
 * The hover state is used for measurement calculations when the alt key is pressed.
 *
 * @param draft - The editor state draft to modify
 * @param segmentIndex - The index of the hovered segment, or null if no segment is hovered
 */
export function self_updateVectorHoveredSegment<
  S extends editor.state.IEditorState,
>(draft: Draft<S>, segmentIndex: number | null) {
  if (draft.content_edit_mode?.type !== "vector") {
    return;
  }

  draft.content_edit_mode.hovered_segment_index = segmentIndex;
}

/**
 * Updates the hovered vertex index in vector content edit mode.
 *
 * This method manages the UI-triggered hover state for vertices in vector edit mode.
 * The hover state is used for visual feedback when hovering over vertices.
 *
 * @param draft - The editor state draft to modify
 * @param vertexIndex - The index of the hovered vertex, or null if no vertex is hovered
 */
export function self_updateVectorHoveredVertex<
  S extends editor.state.IEditorState,
>(draft: Draft<S>, vertexIndex: number | null) {
  if (draft.content_edit_mode?.type !== "vector") {
    return;
  }

  draft.content_edit_mode.hovered_vertex_index = vertexIndex;
}

/**
 * Updates the snapped segment with parametric position in vector content edit mode.
 *
 * This method manages the mathematically resolved snap state for segments in vector edit mode.
 * The snap state contains both the segment index and parametric position (t) for precise targeting.
 * Used for measurement calculations and precise segment targeting.
 *
 * @param draft - The editor state draft to modify
 * @param snappedSegmentP - The snapped segment with parametric position, or null if no segment is snapped
 */
export function self_updateVectorSnappedSegmentP<
  S extends editor.state.IEditorState,
>(draft: Draft<S>, snappedSegmentP: vn.PointOnSegment | null) {
  if (draft.content_edit_mode?.type !== "vector") {
    return;
  }

  draft.content_edit_mode.snapped_segment_p = snappedSegmentP;
}
