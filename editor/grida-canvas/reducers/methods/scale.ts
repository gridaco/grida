import type { Draft } from "immer";
import assert from "assert";
import cmath from "@grida/cmath";
import grida from "@grida/schema";
import vn from "@grida/vn";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import type { ReducerContext } from "..";
import schema from "../schema";
import updateNodeTransform from "../node-transform.reducer";
import { getSnapTargets, threshold } from "../tools/snap";
import { snapObjectsResize } from "../tools/snap-resize";
import { css } from "@/grida-canvas-utils/css";

/**
 * Scale gesture orchestration.
 *
 * This file intentionally owns *all* scale-related orchestration:
 * - regular resize (transform-space scaling)
 * - Scale tool (K) parametric scaling (parameter-space scaling)
 *
 * Pure math + property rewrite rules live under `schema.parametric_scale` and are unit-tested.
 *
 * Spec: https://grida.co/docs/wg/feat-authoring/parametric-scaling
 */

function deepClone<T>(value: T): T {
  // Prefer structuredClone (fast + preserves non-JSON primitives),
  // but keep a JSON fallback for environments where it may be unavailable.
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export function self_start_gesture_scale(
  draft: Draft<editor.state.IEditorState>,
  {
    selection,
    direction,
    context,
  }: {
    selection: string[];
    direction: cmath.CardinalDirection;
    context: ReducerContext;
  }
) {
  if (selection.length === 0) return;

  const rects = selection.map(
    (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
  );

  const is_parametric_scale = draft.tool.type === "scale";
  const initial_bounding_rect = cmath.rect.union(rects);

  let affected_ids: string[] | undefined = undefined;
  let initial_abs_rects_by_id: Record<string, cmath.Rectangle> | undefined =
    undefined;
  let initial_external_parent_abs_rects_by_id:
    | Record<string, cmath.Rectangle>
    | undefined = undefined;

  if (is_parametric_scale) {
    const all = new Set<string>();
    for (const root_id of selection) {
      all.add(root_id);
      dq.getChildren(draft.document_ctx, root_id, true).forEach((id) =>
        all.add(id)
      );
    }

    affected_ids = Array.from(all);
    const affected_set = new Set(affected_ids);

    initial_abs_rects_by_id = {};
    for (const id of affected_ids) {
      const r = context.geometry.getNodeAbsoluteBoundingRect(id);
      if (r) initial_abs_rects_by_id[id] = r;
    }

    initial_external_parent_abs_rects_by_id = {};
    for (const id of affected_ids) {
      const parent_id = dq.getParentId(draft.document_ctx, id);
      if (!parent_id) continue;
      if (affected_set.has(parent_id)) continue;
      const pr = context.geometry.getNodeAbsoluteBoundingRect(parent_id);
      if (pr) initial_external_parent_abs_rects_by_id[id] = pr;
    }
  }

  draft.gesture = {
    type: "scale",
    initial_snapshot: editor.state.snapshot(draft),
    initial_rects: rects,
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    selection: selection,
    direction: direction,
    mode: is_parametric_scale ? "parametric" : "resize",
    initial_bounding_rect: is_parametric_scale
      ? initial_bounding_rect
      : undefined,
    affected_ids: is_parametric_scale ? affected_ids : undefined,
    initial_abs_rects_by_id: is_parametric_scale
      ? initial_abs_rects_by_id
      : undefined,
    initial_external_parent_abs_rects_by_id: is_parametric_scale
      ? initial_external_parent_abs_rects_by_id
      : undefined,
  };

  // For resize (transform scale), we “lock” variable sizes into numeric sizes so the gesture is stable.
  // For parametric scale (K), we MUST NOT bake non-numeric authored values (e.g. width/height: "auto").
  if (is_parametric_scale) return;

  let i = 0;
  for (const node_id of selection) {
    const node = dq.__getNodeById(draft, node_id);
    const rect = rects[i++];

    if (!rect) continue;

    const n = node as grida.program.nodes.i.ICSSDimension;

    // needs width
    if (
      direction === "e" ||
      direction === "w" ||
      direction === "ne" ||
      direction === "se" ||
      direction === "nw" ||
      direction === "sw"
    ) {
      if (typeof n.layout_target_width !== "number") {
        n.layout_target_width =
          node.type === "tspan"
            ? Math.ceil(rect.width)
            : cmath.quantize(rect.width, 1);
      }
    }

    // needs height
    if (
      direction === "n" ||
      direction === "s" ||
      direction === "ne" ||
      direction === "nw" ||
      direction === "se" ||
      direction === "sw"
    ) {
      if (typeof n.layout_target_height !== "number") {
        if (node.type === "line") {
          n.layout_target_height = 0;
        } else {
          n.layout_target_height =
            node.type === "tspan"
              ? Math.ceil(rect.height)
              : cmath.quantize(rect.height, 1);
        }
      }
    }
  }
}

export function self_update_gesture_scale(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  assert(
    draft.gesture.type === "scale" ||
      draft.gesture.type === "insert-and-resize",
    "Gesture type must be scale or insert-and-resize"
  );

  // Scale tool (K): parametric scaling (parameter-space scaling)
  if (
    draft.gesture.type === "scale" &&
    draft.tool.type === "scale" &&
    draft.gesture.mode === "parametric"
  ) {
    return self_update_gesture_parametric_scale(draft, context);
  }

  return self_update_gesture_resize_scale(draft, context);
}

function self_update_gesture_resize_scale(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  const gesture = draft.gesture as
    | editor.gesture.GestureScale
    | editor.gesture.GestureInsertAndResize;

  assert(draft.scene_id, "scene_id is not set");
  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;

  const { transform_with_center_origin, transform_with_preserve_aspect_ratio } =
    draft.gesture_modifiers;

  const {
    selection,
    direction,
    initial_snapshot,
    movement: rawMovement,
    initial_rects,
  } = gesture;

  const initial_bounding_rectangle = cmath.rect.union(initial_rects);

  const origin =
    transform_with_center_origin === "on"
      ? cmath.rect.getCenter(initial_bounding_rectangle)
      : cmath.rect.getCardinalPoint(
          initial_bounding_rectangle,
          cmath.compass.invertDirection(direction)
        );

  // #region snap (reuse same behavior as resize)
  const should_snap =
    draft.gesture_modifiers.scale_with_force_disable_snap !== "on";

  let adjusted_raw_movement = rawMovement;

  if (should_snap) {
    const snap_target_node_ids = getSnapTargets(selection, {
      document_ctx: draft.document_ctx,
      document: draft.document,
    });

    const snap_target_node_rects = snap_target_node_ids
      .map((node_id: string) => {
        const r = context.geometry.getNodeAbsoluteBoundingRect(node_id);
        if (!r) {
          reportError(`Node ${node_id} does not have a bounding rect`);
        }
        return r;
      })
      .filter((r): r is cmath.Rectangle => r !== null && r !== undefined);

    // Collect target aspect ratio from nodes that have layout_target_aspect_ratio set
    // For snap logic, use the first node's target ratio if available
    let snap_target_aspect_ratio: [number, number] | undefined = undefined;
    if (selection.length > 0) {
      const first_node = draft.document.nodes[
        selection[0]
      ] as grida.program.nodes.Node;
      const target_ratio = (first_node as any).layout_target_aspect_ratio as
        | [number, number]
        | undefined;
      if (target_ratio) {
        snap_target_aspect_ratio = target_ratio;
      }
    }

    // Aspect ratio should be preserved for snap if:
    // - Shift key is pressed, OR
    // - Any node in selection has layout_target_aspect_ratio set
    const should_preserve_aspect_ratio_for_snap =
      transform_with_preserve_aspect_ratio === "on" ||
      snap_target_aspect_ratio !== undefined;

    const { adjusted_movement, snapping } = snapObjectsResize(
      initial_rects,
      {
        objects: snap_target_node_rects,
        guides: draft.ruler === "on" ? scene.guides : undefined,
      },
      direction,
      origin,
      rawMovement,
      threshold(
        editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
        draft.transform
      ),
      {
        enabled: should_snap,
        preserveAspectRatio: should_preserve_aspect_ratio_for_snap,
        centerOrigin: transform_with_center_origin === "on",
        targetAspectRatio: snap_target_aspect_ratio,
      }
    );

    adjusted_raw_movement = adjusted_movement;
    draft.surface_snapping = snapping;
  } else {
    draft.surface_snapping = undefined;
  }
  // #endregion

  const movement = cmath.vector2.multiply(
    cmath.compass.cardinal_direction_vector[direction],
    adjusted_raw_movement,
    transform_with_center_origin === "on" ? [2, 2] : [1, 1]
  );

  let i = 0;
  for (const node_id of selection) {
    const node = draft.document.nodes[node_id] as grida.program.nodes.Node;
    const initial_node = initial_snapshot.document.nodes[
      node_id
    ] as grida.program.nodes.Node;
    const initial_rect = initial_rects[i++];

    const parent_id = dq.getParentId(draft.document_ctx, node_id);
    const parent_node = parent_id ? dq.__getNodeById(draft, parent_id) : null;
    const is_scene_parent = parent_node?.type === "scene";

    // TODO: scaling for bitmap node is not supported yet.
    const is_scalable = initial_node.type !== "bitmap";
    if (!is_scalable) continue;

    // Check if node has layout_target_aspect_ratio set
    const targetAspectRatio = (node as any).layout_target_aspect_ratio as
      | [number, number]
      | undefined;

    // Aspect ratio should be preserved if:
    // - Shift key is pressed (transform_with_preserve_aspect_ratio === "on"), OR
    // - Node has layout_target_aspect_ratio set
    const should_preserve_aspect_ratio =
      transform_with_preserve_aspect_ratio === "on" ||
      targetAspectRatio !== undefined;

    if (!parent_id || is_scene_parent) {
      updateNodeTransform(
        node,
        {
          type: "scale",
          rect: initial_rect,
          origin: origin,
          movement,
          preserveAspectRatio: should_preserve_aspect_ratio,
          targetAspectRatio: targetAspectRatio,
        },
        context.geometry,
        node_id
      );
    } else {
      const parent_rect =
        context.geometry.getNodeAbsoluteBoundingRect(parent_id)!;
      assert(
        parent_rect,
        "Parent rect must be defined : " + parent_id + "/" + node_id
      );

      const relative_position = cmath.vector2.sub(
        [initial_rect.x, initial_rect.y],
        [parent_rect.x, parent_rect.y]
      );

      const relative_rect: cmath.Rectangle = {
        x: relative_position[0],
        y: relative_position[1],
        width: initial_rect.width,
        height: initial_rect.height,
      };

      const relative_origin = cmath.vector2.sub(origin, [
        parent_rect.x,
        parent_rect.y,
      ]);

      updateNodeTransform(
        node,
        {
          type: "scale",
          rect: relative_rect,
          origin: relative_origin,
          movement,
          preserveAspectRatio: should_preserve_aspect_ratio,
          targetAspectRatio: targetAspectRatio,
        },
        context.geometry,
        node_id
      );
    }

    if (initial_node.type === "vector") {
      const initial_dimensions: cmath.Rectangle = {
        x: 0,
        y: 0,
        width: initial_rect.width,
        height: initial_rect.height,
      };

      // Use geometry query to get resolved dimensions instead of fallback
      const final_rect = context.geometry.getNodeAbsoluteBoundingRect(node_id);
      assert(
        final_rect,
        `Node ${node_id} does not have a bounding rect after transform`
      );
      const final_dimensions: cmath.Rectangle = {
        x: 0,
        y: 0,
        width: final_rect.width,
        height: final_rect.height,
      };

      let scale: cmath.Vector2;
      if (initial_dimensions.width === 0 && initial_dimensions.height === 0) {
        scale = [1, 1];
      } else if (initial_dimensions.width === 0) {
        const factor =
          initial_dimensions.height !== 0
            ? final_dimensions.height / initial_dimensions.height
            : 1;
        scale = [factor, factor];
      } else if (initial_dimensions.height === 0) {
        const factor =
          initial_dimensions.width !== 0
            ? final_dimensions.width / initial_dimensions.width
            : 1;
        scale = [factor, factor];
      } else {
        scale = cmath.rect.getScaleFactors(
          initial_dimensions,
          final_dimensions
        );
      }

      const vne = new vn.VectorNetworkEditor(
        (initial_node as grida.program.nodes.VectorNode).vector_network
      );
      vne.scale(scale);
      (
        draft.document.nodes[node_id] as grida.program.nodes.VectorNode
      ).vector_network = vne.value;
    }
  }
}
function dominantAxisByMovement(m: cmath.Vector2): "x" | "y" {
  // Reuse cmath's dominance logic (ties resolve to "y").
  const locked = cmath.ext.movement.axisLockedByDominance([m[0], m[1]]);
  return locked[0] === null ? "y" : "x";
}

type AutoSpaceRoot = {
  id: string;
  initialRect: cmath.Rectangle;
  hasLeft: boolean;
  hasTop: boolean;
};

function resolveScaleOriginPoint(
  bounds: cmath.Rectangle,
  origin: "center" | cmath.CardinalDirection
): cmath.Vector2 {
  return origin === "center"
    ? cmath.rect.getCenter(bounds)
    : cmath.rect.getCardinalPoint(bounds, origin);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object")
    return value as Record<string, unknown>;
  return null;
}

function collectAutoSpaceRootsFromGesture(args: {
  draft: Draft<editor.state.IEditorState>;
  selection: string[];
  initial_rects: cmath.Rectangle[];
  initial_snapshot: ReturnType<typeof editor.state.snapshot>;
}): AutoSpaceRoot[] {
  const initial_rect_by_root_id: Record<string, cmath.Rectangle> = {};
  for (let i = 0; i < args.selection.length; i++) {
    const id = args.selection[i];
    const r = args.initial_rects[i];
    if (r) initial_rect_by_root_id[id] = r;
  }

  const roots: AutoSpaceRoot[] = [];
  for (const root_id of args.selection) {
    const parent_id = dq.getParentId(args.draft.document_ctx, root_id);
    if (parent_id !== args.draft.scene_id) continue;

    const initial_node = args.initial_snapshot.document.nodes[root_id] as
      | grida.program.nodes.Node
      | undefined;
    if (!initial_node || initial_node.type === "scene") continue;

    const o = toRecord(initial_node);
    if (!o) continue;
    if (o["position"] !== "absolute") continue;
    if (
      !grida.program.nodes.hasLayoutWidth(initial_node) ||
      !grida.program.nodes.hasLayoutHeight(initial_node) ||
      initial_node.layout_target_width === "auto" ||
      initial_node.layout_target_height === "auto"
    )
      continue;

    const initialRect = initial_rect_by_root_id[root_id];
    if (!initialRect) continue;

    roots.push({
      id: root_id,
      initialRect,
      hasLeft: typeof o["left"] === "number",
      hasTop: typeof o["top"] === "number",
    });
  }

  return roots;
}

function collectAutoSpaceRootsForCommand(args: {
  draft: Draft<editor.state.IEditorState>;
  context: ReducerContext;
  targets: string[];
}): AutoSpaceRoot[] {
  const roots: AutoSpaceRoot[] = [];

  for (const root_id of args.targets) {
    const parent_id = dq.getParentId(args.draft.document_ctx, root_id);
    if (parent_id !== args.draft.scene_id) continue;

    const node = args.draft.document.nodes[root_id] as
      | grida.program.nodes.Node
      | undefined;
    if (!node || node.type === "scene") continue;

    const o = toRecord(node);
    if (!o) continue;
    if (o["position"] !== "absolute") continue;
    if (
      !grida.program.nodes.hasLayoutWidth(node) ||
      !grida.program.nodes.hasLayoutHeight(node) ||
      node.layout_target_width === "auto" ||
      node.layout_target_height === "auto"
    )
      continue;

    const rect =
      args.context.geometry.getNodeAbsoluteBoundingRect(root_id) ??
      (typeof o["left"] === "number" && typeof o["top"] === "number"
        ? {
            x: o["left"],
            y: o["top"],
            width: css.toPxNumber(node.layout_target_width),
            height: css.toPxNumber(node.layout_target_height),
          }
        : null);

    if (!rect) continue;

    roots.push({
      id: root_id,
      initialRect: rect,
      hasLeft: typeof o["left"] === "number",
      hasTop: typeof o["top"] === "number",
    });
  }

  return roots;
}

function applyAutoSpaceRootLeftTopOverride(args: {
  draft: Draft<editor.state.IEditorState>;
  roots: ReadonlyArray<AutoSpaceRoot>;
  origin: cmath.Vector2;
  factor: number;
}) {
  for (const root of args.roots) {
    if (!root.hasLeft && !root.hasTop) continue;

    const scaled = schema.parametric_scale.scale_rect_about_anchor(
      root.initialRect,
      args.origin,
      args.factor
    );

    const node = args.draft.document.nodes[root.id] as
      | grida.program.nodes.Node
      | undefined;
    if (!node || node.type === "scene") continue;

    const o = toRecord(node);
    if (!o) continue;

    if (root.hasLeft) {
      // selection-root override (only if authored as numeric)
      o["left"] = scaled.x;
    }
    if (root.hasTop) {
      // selection-root override (only if authored as numeric)
      o["top"] = scaled.y;
    }
  }
}

function self_update_gesture_parametric_scale(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext
) {
  assert(draft.gesture.type === "scale");
  if (draft.gesture.mode !== "parametric") return;
  assert(draft.scene_id, "scene_id is not set");

  const scene = draft.document.nodes[
    draft.scene_id
  ] as grida.program.nodes.SceneNode;

  const {
    selection,
    direction,
    initial_snapshot,
    initial_rects,
    movement: rawMovement,
    initial_bounding_rect: _initial_bounding_rect,
    affected_ids,
  } = draft.gesture;

  assert(affected_ids, "parametric scale requires affected_ids");

  const initial_bounding_rect =
    _initial_bounding_rect ?? cmath.rect.union(initial_rects);

  const { transform_with_center_origin } = draft.gesture_modifiers;

  const origin =
    transform_with_center_origin === "on"
      ? cmath.rect.getCenter(initial_bounding_rect)
      : cmath.rect.getCardinalPoint(
          initial_bounding_rect,
          cmath.compass.invertDirection(direction)
        );

  // #region snap (reuse same behavior as resize)
  const should_snap =
    draft.gesture_modifiers.scale_with_force_disable_snap !== "on";

  let adjusted_raw_movement = rawMovement;

  if (should_snap) {
    const snap_target_node_ids = getSnapTargets(selection, {
      document_ctx: draft.document_ctx,
      document: draft.document,
    });

    const snap_target_node_rects = snap_target_node_ids
      .map((node_id: string) => {
        const r = context.geometry.getNodeAbsoluteBoundingRect(node_id);
        if (!r) reportError(`Node ${node_id} does not have a bounding rect`);
        return r;
      })
      .filter((r): r is cmath.Rectangle => r !== null && r !== undefined);

    const { adjusted_movement, snapping } = snapObjectsResize(
      initial_rects,
      {
        objects: snap_target_node_rects,
        guides: draft.ruler === "on" ? scene.guides : undefined,
      },
      direction,
      origin,
      rawMovement,
      threshold(
        editor.config.DEFAULT_SNAP_MOVEMNT_THRESHOLD_FACTOR,
        draft.transform
      ),
      {
        enabled: should_snap,
        preserveAspectRatio: true,
        centerOrigin: transform_with_center_origin === "on",
      }
    );

    adjusted_raw_movement = adjusted_movement;
    draft.surface_snapping = snapping;
  } else {
    draft.surface_snapping = undefined;
  }
  // #endregion

  const direction_vector = cmath.compass.cardinal_direction_vector[direction];
  const center_multiplier: cmath.Vector2 =
    transform_with_center_origin === "on" ? [2, 2] : [1, 1];

  // Scale tool (K) prioritizes visual consistency (uniform similarity scale).
  // To avoid "snapping/quantizing both axes" jitter, we only use the dominant
  // movement axis to derive the uniform scale factor, then apply it uniformly.
  const unadjusted = cmath.vector2.multiply(
    direction_vector,
    rawMovement,
    center_multiplier
  );
  const dominant_axis = dominantAxisByMovement(unadjusted);

  const movement = cmath.vector2.multiply(
    direction_vector,
    adjusted_raw_movement,
    center_multiplier
  );

  const movement_for_factor: cmath.Vector2 =
    dominant_axis === "x" ? [movement[0], 0] : [0, movement[1]];

  const s = schema.parametric_scale._uniform_scale_factor(
    initial_bounding_rect,
    movement_for_factor,
    0.01
  );

  // Expose canonical uniform scale factor on gesture state (used by UI).
  draft.gesture.uniform_scale = s;

  // Reset affected nodes to the initial snapshot (prevents accumulation).
  for (const id of affected_ids) {
    const initial = initial_snapshot.document.nodes[id] as
      | grida.program.nodes.Node
      | undefined;
    if (initial) {
      draft.document.nodes[id] = deepClone(initial);
    }
  }

  for (const id of affected_ids) {
    const node = draft.document.nodes[id] as
      | grida.program.nodes.Node
      | undefined;
    if (!node) continue;
    if (node.type === "scene") continue;

    schema.parametric_scale.apply_node(node, s);
  }

  // `auto` origin semantics for selection roots (scene-direct only):
  // after applying raw numeric scaling, override selection-root `left/top` so the
  // anchor behaves selection-local (resize-like) without forcing layout resolution.
  const auto_roots = collectAutoSpaceRootsFromGesture({
    draft,
    selection,
    initial_rects: initial_rects,
    initial_snapshot,
  });
  if (auto_roots.length) {
    applyAutoSpaceRootLeftTopOverride({
      draft,
      roots: auto_roots,
      origin,
      factor: s,
    });
  }
}

/**
 * Apply parameter-space scaling as a one-shot command (used by the properties panel).
 *
 * This is a document rewrite (no persistent transform matrix):
 * - geometry is recalculated from current authored geometry
 * - geometry-contributing properties are rewritten via `schema.parametric_scale.apply_node`
 */
export function self_apply_scale_by_factor(
  draft: Draft<editor.state.IEditorState>,
  context: ReducerContext,
  opts: {
    targets: string[];
    factor: number;
    origin: "center" | cmath.CardinalDirection;
    include_subtree: boolean;
    space?: "auto" | "global";
  }
) {
  assert(draft.scene_id, "scene_id is not set");
  const s = schema.parametric_scale._clamp_scale(opts.factor);
  if (s === 1) return;

  const space = opts.space ?? "auto";
  const targets = opts.targets;
  if (!targets.length) return;

  const auto_roots =
    space === "auto"
      ? collectAutoSpaceRootsForCommand({ draft, context, targets })
      : [];

  const auto_bounds =
    space === "auto" && auto_roots.length
      ? cmath.rect.union(auto_roots.map((r) => r.initialRect))
      : null;
  const auto_origin =
    space === "auto" && auto_bounds
      ? resolveScaleOriginPoint(auto_bounds, opts.origin)
      : null;

  const affected = new Set<string>();
  for (const root_id of targets) {
    affected.add(root_id);
    if (opts.include_subtree) {
      dq.getChildren(draft.document_ctx, root_id, true).forEach((id) =>
        affected.add(id)
      );
    }
  }
  const affected_ids = Array.from(affected);

  for (const id of affected_ids) {
    const node = draft.document.nodes[id] as
      | grida.program.nodes.Node
      | undefined;
    if (!node) continue;
    if (node.type === "scene") continue;

    schema.parametric_scale.apply_node(node, s);
  }

  if (space === "auto" && auto_origin && auto_roots.length) {
    applyAutoSpaceRootLeftTopOverride({
      draft,
      roots: auto_roots,
      origin: auto_origin,
      factor: s,
    });
  }
}
