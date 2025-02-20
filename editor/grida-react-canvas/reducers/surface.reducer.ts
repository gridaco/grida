import { produce, type Draft } from "immer";

import type { SurfaceAction } from "../action";
import {
  DEFAULT_GAP_ALIGNMENT_TOLERANCE,
  Guide,
  type ToolModeType,
  type IDocumentEditorState,
  type LayoutSnapshot,
} from "../state";
import { document } from "../document-query";
import { getInitialCurveGesture } from "./tools/gesture";
import assert from "assert";
import { cmath } from "@grida/cmath";
import { domapi } from "../domapi";
import { grida } from "@/grida";
import { self_clearSelection, self_selectNode } from "./methods";
import { createMinimalDocumentStateSnapshot } from "./tools/snapshot";

export default function surfaceReducer<S extends IDocumentEditorState>(
  state: S,
  action: SurfaceAction
): S {
  switch (action.type) {
    // #region [universal backend] canvas event target
    case "surface/ruler": {
      const { state: rulerstate } = action;
      return produce(state, (draft) => {
        draft.ruler = rulerstate;
      });
    }
    case "surface/guide/delete": {
      const { idx } = action;
      return produce(state, (draft) => {
        draft.guides.splice(idx, 1);
      });
    }
    case "surface/pixel-grid": {
      const { state: pixelgridstate } = action;
      return produce(state, (draft) => {
        draft.pixelgrid = pixelgridstate;
      });
      break;
    }
    case "surface/content-edit-mode/try-enter": {
      if (state.selection.length !== 1) break;
      const node_id = state.selection[0];
      const node = document.__getNodeById(state, node_id);

      return produce(state, (draft) => {
        switch (node.type) {
          case "text": {
            // the text node should have a string literal value assigned (we don't support props editing via surface)
            if (typeof node.text !== "string") return;

            draft.content_edit_mode = {
              type: "text",
              node_id: node_id,
            };
            break;
          }
          // case "vector":
          case "path": {
            draft.content_edit_mode = {
              type: "path",
              node_id: node_id,
              selected_vertices: [],
              a_point: null,
              next_ta: null,
              path_cursor_position: draft.pointer.position,
            };
            break;
          }
          // TODO: experimental - remove me
          // case "rectangle":
          // case "ellipse": {
          //   if (node.fill?.type === "linear_gradient") {
          //     draft.content_edit_mode = {
          //       type: "gradient",
          //       node_id: node_id,
          //     };
          //   }
          //   //
          // }
          case "bitmap": {
            const node = document.__getNodeById(
              draft,
              node_id
            ) as grida.program.nodes.BitmapNode;
            draft.content_edit_mode = {
              type: "bitmap",
              node_id: node.id,
              imageRef: node.imageRef,
            };
            draft.tool = {
              type: "brush",
            };
            self_clearSelection(draft);
            break;
          }
        }
      });

      break;
    }
    case "surface/content-edit-mode/try-exit": {
      return produce(state, (draft) => {
        draft.content_edit_mode = undefined;
        draft.tool = { type: "cursor" };
      });
    }
    case "surface/tool": {
      const { tool } = action;
      const path_edit_mode_valid_tool_modes: ToolModeType[] = [
        "cursor",
        "hand",
        "path",
      ];
      const text_edit_mode_valid_tool_modes: ToolModeType[] = ["cursor"];
      const bitmap_edit_mode_valid_tool_modes: ToolModeType[] = [
        "brush",
        "eraser",
        "flood-fill",
      ];
      return produce(state, (draft) => {
        // validate cursor mode
        if (draft.content_edit_mode) {
          switch (draft.content_edit_mode.type) {
            case "path":
              if (!path_edit_mode_valid_tool_modes.includes(tool.type)) return;
              break;
            case "text":
              if (!text_edit_mode_valid_tool_modes.includes(tool.type)) return;
              break;
            case "bitmap":
              if (!bitmap_edit_mode_valid_tool_modes.includes(tool.type)) {
                draft.content_edit_mode = undefined;
              }
              break;
          }
        }

        draft.tool = tool;
      });
    }
    case "surface/brush": {
      const { brush } = action;
      return produce(state, (draft) => {
        if (draft.tool.type === "brush" || draft.tool.type === "eraser") {
          draft.brush = { opacity: 1, ...brush };
        }
      });
      break;
    }
    case "surface/brush/size": {
      const { size } = action;

      return produce(state, (draft) => {
        if (!(draft.tool.type === "brush" || draft.tool.type === "eraser"))
          return;
        switch (size.type) {
          case "set":
            draft.brush.size = [size.value, size.value];
            break;
          case "delta":
            draft.brush.size = cmath.vector2.add(draft.brush.size, [
              size.value,
              size.value,
            ]);
            break;
        }
        draft.brush.size = cmath.vector2.max([1, 1], draft.brush.size);
      });
      break;
    }
    case "surface/brush/opacity": {
      const { opacity } = action;

      return produce(state, (draft) => {
        if (draft.tool.type !== "brush") return;
        switch (opacity.type) {
          case "set":
            draft.brush.opacity = opacity.value;
            break;
          case "delta":
            draft.brush.opacity += opacity.value;
            break;
        }
        draft.brush.opacity = cmath.clamp(draft.brush.opacity, 0, 1);
      });

      break;
    }
    case "surface/gesture/start": {
      const { gesture } = action;

      const cdom = new domapi.CanvasDOM(state.transform);

      return produce(state, (draft) => {
        draft.surface_snapping = undefined;

        switch (gesture.type) {
          case "guide": {
            const { axis, idx } = gesture;

            if (idx === -1) {
              const t = cmath.transform.getTranslate(state.transform);
              const s = cmath.transform.getScale(state.transform);

              const axi = axis === "x" ? 0 : 1;

              const next = {
                axis,
                offset: -cmath.quantize(t[axi] * (1 / s[axi]), 1),
              } satisfies Guide;
              const idx = draft.guides.push(next) - 1;

              // new
              draft.gesture = {
                type: "guide",
                axis,
                idx: idx,
                offset: next.offset,
                initial_offset: next.offset,
                movement: cmath.vector2.zero,
                first: cmath.vector2.zero,
                last: cmath.vector2.zero,
              };
            } else {
              // existing
              const guide = state.guides[idx];
              assert(guide.axis === axis, "guide gesture axis mismatch");
              draft.gesture = {
                type: "guide",
                axis,
                idx: idx,
                offset: guide.offset,
                initial_offset: guide.offset,
                movement: cmath.vector2.zero,
                first: cmath.vector2.zero,
                last: cmath.vector2.zero,
              };
            }

            break;
          }
          case "curve": {
            const { node_id, segment, control } = gesture;

            assert(state.content_edit_mode?.type === "path");
            assert(state.content_edit_mode?.node_id === node_id);

            draft.gesture = getInitialCurveGesture(state, {
              node_id,
              segment,
              control,
              invert: false,
            });
            break;
          }
          case "scale": {
            const { selection, direction } = gesture;
            //

            draft.content_edit_mode = undefined;
            draft.hovered_node_id = null;

            self_start_gesture_scale(draft, {
              selection: selection,
              direction: direction,
              cdom,
            });
            //
            break;
          }
          case "corner-radius": {
            const { node_id } = gesture;

            self_selectNode(draft, "reset", node_id);
            draft.gesture = {
              type: "corner-radius",
              movement: cmath.vector2.zero,
              first: cmath.vector2.zero,
              last: cmath.vector2.zero,
              initial_bounding_rectangle: cdom.getNodeBoundingRect(node_id)!,
              node_id: node_id,
            };
            break;
          }
          case "rotate": {
            const { selection } = gesture;

            self_selectNode(draft, "reset", selection);
            self_start_gesture_rotate(draft, {
              selection: selection,
              initial_bounding_rectangle: cdom.getNodeBoundingRect(selection)!,
              // TODO: the offset of rotation handle relative to the center of the rectangle
              offset: cmath.vector2.zero,
            });
            //
            break;
          }
          case "translate-vertex": {
            const { vertex: index } = gesture;

            const { content_edit_mode } = draft;
            assert(content_edit_mode && content_edit_mode.type === "path");
            const { node_id } = content_edit_mode;
            const node = document.__getNodeById(
              draft,
              node_id
            ) as grida.program.nodes.PathNode;

            const verticies = node.vectorNetwork.vertices.map((v) => v.p);

            content_edit_mode.selected_vertices = [index];
            content_edit_mode.a_point = index;

            draft.gesture = {
              type: "translate-vertex",
              node_id: node_id,
              initial_verticies: verticies,
              vertex: index,
              movement: cmath.vector2.zero,
              first: cmath.vector2.zero,
              last: cmath.vector2.zero,
              initial_position: [node.left!, node.top!],
            };
            break;
            //
          }
          case "sort": {
            const { selection, node_id } = gesture;

            // assure the selection shares the same parent
            const parent_id = document.getParentId(state.document_ctx, node_id);
            if (
              !selection.every(
                (it) =>
                  document.getParentId(state.document_ctx, it) === parent_id
              )
            ) {
              return;
            }

            const layout = createLayoutSnapshot(state, parent_id!, selection);
            const initial_index = layout.objects.findIndex(
              (it) => it.id === node_id
            );

            const initial_placement = {
              index: initial_index,
              rect: layout.objects[initial_index],
            };

            draft.gesture = {
              type: "sort",
              node_id: node_id,
              node_initial_rect: layout.objects[initial_index],
              layout: layout,
              placement: initial_placement,
              movement: cmath.vector2.zero,
              first: cmath.vector2.zero,
              last: cmath.vector2.zero,
            };

            draft.dropzone = {
              type: "rect",
              rect: initial_placement.rect,
            };
            break;
          }
          case "gap": {
            const { selection, axis } = gesture;

            // [gap gesture]
            // mode 1: gap (distribute) the group of selection
            // mode 2: update the gap the flex container (parent)

            if (Array.isArray(selection)) {
              // assure the selection shares the same parent
              const parent_id = document.getParentId(
                state.document_ctx,
                selection[0]
              );
              if (
                !selection.every(
                  (it) =>
                    document.getParentId(state.document_ctx, it) === parent_id
                )
              ) {
                return;
              }

              const layout = createLayoutSnapshot(state, parent_id!, selection);
              layout.objects.sort((a, b) => a[axis] - b[axis]);

              const [gap] = cmath.rect.getUniformGap(
                layout.objects,
                axis,
                DEFAULT_GAP_ALIGNMENT_TOLERANCE
              );

              assert(gap !== undefined, "gap is not uniform");

              // the negaive size of the smallet object or the first sorted object's size (+1)
              const min_gap =
                -Math.min(
                  ...layout.objects.map((it) =>
                    cmath.rect.getAxisDimension(it, axis)
                  )
                ) + 1;

              draft.gesture = {
                type: "gap",
                axis,
                layout,
                min_gap: min_gap,
                initial_gap: gap,
                gap: gap,
                movement: cmath.vector2.zero,
                first: cmath.vector2.zero,
                last: cmath.vector2.zero,
              };
            } else {
              // assert the selection to be a flex container
              const node = document.__getNodeById(state, selection);
              assert(
                node.type === "container" && node.layout === "flex",
                "the selection is not a flex container"
              );
              // (we only support main axis gap for now) - ignoring the input axis.
              const { direction, mainAxisGap } = node;

              const children = document.getChildren(
                state.document_ctx,
                selection
              );

              const layout = createLayoutSnapshot(state, selection, children);

              draft.gesture = {
                type: "gap",
                axis: direction === "horizontal" ? "x" : "y",
                layout,
                min_gap: 0,
                initial_gap: mainAxisGap,
                gap: mainAxisGap,
                movement: cmath.vector2.zero,
                first: cmath.vector2.zero,
                last: cmath.vector2.zero,
              };
              //
            }

            break;
          }
        }
      });
    }
    // #endregion
  }
  //
  return state;
}

function createLayoutSnapshot(
  state: IDocumentEditorState,
  group: string,
  items: string[]
): LayoutSnapshot {
  const cdom = new domapi.CanvasDOM(state.transform);

  const parent = document.__getNodeById(state, group);
  const parent_rect = cdom.getNodeBoundingRect(group)!;
  const objects: LayoutSnapshot["objects"] = items.map((node_id) => {
    const abs_rect = cdom.getNodeBoundingRect(node_id)!;
    const rel_rect = cmath.rect.translate(abs_rect, [
      -parent_rect.x,
      -parent_rect.y,
    ]);

    return {
      ...rel_rect,
      id: node_id,
    };
  });

  const is_group_flex_container =
    parent.type === "container" && parent.layout === "flex";

  return {
    type: is_group_flex_container ? "flex" : "group",
    group,
    objects,
  };
}

function self_start_gesture_scale(
  draft: Draft<IDocumentEditorState>,
  {
    selection,
    direction,
    cdom,
  }: {
    selection: string[];
    direction: cmath.CardinalDirection;
    cdom: domapi.CanvasDOM;
  }
) {
  if (selection.length === 0) return;
  const rects = selection.map((node_id) => cdom.getNodeBoundingRect(node_id)!);

  draft.gesture = {
    type: "scale",
    initial_snapshot: createMinimalDocumentStateSnapshot(draft),
    initial_rects: rects,
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
    selection: selection,
    direction: direction,
  };

  let i = 0;
  for (const node_id of selection) {
    const node = document.__getNodeById(draft, node_id);
    const rect = rects[i++];

    // once the node's measurement mode is set to fixed (from drag start), we may safely cast the width / height sa fixed number
    // need to assign a fixed size if width or height is a variable length
    const _node = node as grida.program.nodes.i.ICSSDimension;
    if (typeof _node.width !== "number") {
      _node.width = rect.width;
    }
    if (typeof _node.height !== "number") {
      if (node.type === "line") {
        _node.height = 0;
      } else {
        _node.height = rect.height;
      }
    }
  }
}

function self_start_gesture_rotate(
  draft: Draft<IDocumentEditorState>,
  {
    selection,
    offset,
    initial_bounding_rectangle,
  }: {
    selection: string;
    initial_bounding_rectangle: cmath.Rectangle;
    offset: cmath.Vector2;
  }
) {
  const { rotation } = document.__getNodeById(
    draft,
    selection
  ) as grida.program.nodes.i.IRotation;

  draft.gesture = {
    type: "rotate",
    initial_bounding_rectangle: initial_bounding_rectangle,
    offset: offset,
    selection: selection,
    rotation: rotation,
    movement: cmath.vector2.zero,
    first: cmath.vector2.zero,
    last: cmath.vector2.zero,
  };
}
