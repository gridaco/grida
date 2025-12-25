import { type Draft } from "immer";
import { updateState } from "./utils/immer";
import type {
  DocumentAction,
  EditorSelectAction,
  NodeChangeAction,
  TemplateEditorSetTemplatePropsAction,
  TemplateNodeOverrideChangeAction,
  NodeToggleUnderlineAction,
  NodeToggleLineThroughAction,
  EditorSelectGradientStopAction,
  EditorDeleteGradientStopAction,
  EditorVectorBendOrClearCornerAction,
  EditorVariableWidthSelectStopAction,
  EditorVariableWidthDeleteStopAction,
  EditorVariableWidthAddStopAction,
  EditorVectorDeleteSelectionAction,
} from "@/grida-canvas/action";
import { editor } from "@/grida-canvas";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import assert from "assert";
import nodeReducer from "./node.reducer";
import surfaceReducer from "./surface.reducer";
import updateNodeTransform from "./node-transform.reducer";
import { __validateHoverState } from "./methods/hover";
import {
  self_clearSelection,
  self_try_remove_node,
  self_duplicateNode,
  self_insertSubDocument,
  self_try_insert_node,
  self_selectNode,
  self_updateVectorNodeVectorNetwork,
  reduceVectorContentSelection,
  getUXNeighbouringVertices,
  encodeTranslateVectorCommand,
  self_flattenNode,
  normalizeVectorNodeBBox,
  supportsFlatten,
  self_select_tool,
  getVectorSelectionStartPoint,
  self_nudge_transform,
} from "./methods";
import { self_apply_scale_by_factor } from "./methods/scale";
import {
  getPackedSubtreeBoundingRect,
  getViewportAwareDelta,
} from "@/grida-canvas/utils/insertion";
import {
  self_wrapNodes,
  self_ungroup,
  self_wrapNodesAsBooleanOperation,
} from "./methods/wrap";
import cmath from "@grida/cmath";
import kolor from "@grida/color";
import { layout } from "@grida/cmath/_layout";
import { snapMovement } from "./tools/snap";
import schemaReducer from "./schema.reducer";
import { self_moveNode } from "./methods/move";
import { v4 } from "uuid";
import type { ReducerContext } from ".";
import cg from "@grida/cg";
import vn from "@grida/vn";
import tree from "@grida/tree";
import { EDITOR_GRAPH_POLICY } from "@/grida-canvas/policy";
import "core-js/features/object/group-by";

/**
 * the padding applied to the anchors (siblings) for dynamic next placement
 *
 * commonly known as 'minimal space between artboards'
 */
const PLACEMENT_ANCHORS_PADDING = 40;

/**
 * the inset applied to the viewport for dynamic placement
 *
 * the inset is inteded to be applied **before** being converted to canvas space (for better visual consistency)
 */
const PLACEMENT_VIEWPORT_INSET = 40;

/**
 * Helper to get a SceneNode from the document.
 * Scenes are stored as nodes, so we lookup from document.nodes.
 */
function getScene(
  document: grida.program.document.Document,
  scene_id: string
): grida.program.nodes.SceneNode {
  const node = document.nodes[scene_id];
  assert(node?.type === "scene", `Scene ${scene_id} not found or not a scene`);
  return node as grida.program.nodes.SceneNode;
}

export default function documentReducer<S extends editor.state.IEditorState>(
  state: S,
  action: DocumentAction,
  context: ReducerContext
): S {
  if (!state.editable) return state;

  assert(state.scene_id, "scene_id is required for autolayout");

  switch (action.type) {
    case "scenes/new": {
      const { scene } = action;
      const scene_id = scene?.id ?? context.idgen.next();
      const scene_count = state.document.scenes_ref.length;

      // check if the scene id does not conflict
      if (state.document.nodes[scene_id]) {
        console.error(`Scene id ${scene_id} already exists`);
        return state;
      }

      // Create scene as a SceneNode
      const new_scene_node: grida.program.nodes.SceneNode = {
        type: "scene",
        id: scene_id,
        name: scene?.name ?? `Scene ${scene_count + 1}`,
        active: true,
        locked: false,
        constraints: {
          children: scene?.constraints?.children ?? "multiple",
        },
        order: scene?.order ?? scene_count,
        guides: scene?.guides ?? [],
        edges: scene?.edges ?? [],
        background_color: scene?.background_color,
      };

      return updateState(state, (draft) => {
        // 0. add scene to nodes and initialize its links
        draft.document.nodes[scene_id] = new_scene_node;
        draft.document.links[scene_id] = [];

        // 1. Add to scenes_ref array
        draft.document.scenes_ref.push(scene_id);

        // 2. Rebuild document context to include the new scene
        const graph = new tree.graph.Graph(draft.document, EDITOR_GRAPH_POLICY);
        draft.document_ctx = graph.lut;

        // 3. change the scene_id
        draft.scene_id = scene_id;
        // 4. clear scene-specific state
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);
      });
    }
    case "scenes/delete": {
      const { scene: scene_id } = action;

      // a11y/bug prevent scene from being deleted if len === 1
      // Prevent deletion of the last remaining scene
      if (state.document.scenes_ref.length === 1) {
        return state;
      }

      return updateState(state, (draft) => {
        // Use Graph.rm() to remove scene and all its children
        const graph = new tree.graph.Graph(draft.document, EDITOR_GRAPH_POLICY);
        const removed_ids = graph.rm(scene_id);

        // Remove from scenes_ref array
        draft.document.scenes_ref = draft.document.scenes_ref.filter(
          (id) => id !== scene_id
        );

        // Update context from graph's cached LUT
        draft.document_ctx = graph.lut;

        // Update scene_id if the deleted scene was active
        if (draft.scene_id === scene_id) {
          draft.scene_id = draft.document.scenes_ref[0];
        }
        if (draft.document.entry_scene_id === scene_id) {
          draft.document.entry_scene_id = draft.scene_id;
        }
        // Clear scene-specific state
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);
      });
    }
    case "scenes/duplicate": {
      const { scene: scene_id } = action;

      // check if the scene exists
      const origin_node = state.document.nodes[scene_id] as
        | grida.program.nodes.SceneNode
        | undefined;
      if (!origin_node || origin_node.type !== "scene") return state;

      const origin_children = state.document.links[scene_id] || [];
      const new_scene_id = context.idgen.next();

      // Create duplicated SceneNode
      const new_scene_node: grida.program.nodes.SceneNode = {
        ...origin_node,
        id: new_scene_id,
        name: origin_node.name + " copy",
        order: origin_node.order ? origin_node.order + 1 : undefined,
      };

      return updateState(state, (draft) => {
        // 0. add the new scene node
        draft.document.nodes[new_scene_id] = new_scene_node;
        draft.document.links[new_scene_id] = [];

        // 1. Add to scenes_ref array
        draft.document.scenes_ref.push(new_scene_id);

        // 2. change the scene_id to the new scene
        draft.scene_id = new_scene_id;
        // 3. clear scene-specific state
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);

        // 4. clone nodes recursively
        for (const child_id of origin_children) {
          const prototype =
            grida.program.nodes.factory.createPrototypeFromSnapshot(
              state.document,
              child_id
            );
          const sub =
            grida.program.nodes.factory.create_packed_scene_document_from_prototype(
              prototype,
              () => context.idgen.next()
            );
          self_insertSubDocument(draft, new_scene_id, sub);
        }
      });
    }
    case "scenes/change/name": {
      const { scene, name } = action;
      return updateState(state, (draft) => {
        // Update the SceneNode directly
        const scene_node = draft.document.nodes[
          scene
        ] as grida.program.nodes.SceneNode;
        if (scene_node?.type === "scene") {
          scene_node.name = name;
        }
      });
    }
    case "scenes/change/background-color": {
      const { scene } = action;
      return updateState(state, (draft) => {
        // Update the SceneNode directly
        const scene_node = draft.document.nodes[
          scene
        ] as grida.program.nodes.SceneNode;
        if (scene_node?.type === "scene") {
          scene_node.background_color = action.backgroundColor;
        }
      });
    }
    case "select": {
      return updateState(state, (draft) => {
        const { selection, mode = "reset" } = <EditorSelectAction>action;
        self_selectNode(draft, mode, ...selection);
      });
    }
    case "blur": {
      return updateState(state, (draft) => {
        self_clearSelection(draft);
      });
    }
    case "hover/title-bar": {
      const { event, target } = action;
      switch (event) {
        case "enter": {
          return updateState(state, (draft) => {
            // Set both hovered_node_id and hovered_node_source
            // This marks it as a title bar hover, preventing hit-testing from clearing it
            draft.hovered_node_id = target;
            draft.hovered_node_source = "title-bar";
            // Validate state consistency
            __validateHoverState(draft);
          });
        }
        case "leave": {
          return updateState(state, (draft) => {
            // Only clear if this is the currently hovered node and it's from title bar
            // This ensures we don't clear hover from other sources
            if (
              draft.hovered_node_id === target &&
              draft.hovered_node_source === "title-bar"
            ) {
              draft.hovered_node_id = null;
              draft.hovered_node_source = null;
            }
            // Validate state consistency
            __validateHoverState(draft);
          });
        }
      }
      break;
    }
    case "hover/ui": {
      const { event, target } = action;
      switch (event) {
        case "enter": {
          return updateState(state, (draft) => {
            // Set hovered_node_id and source for hierarchy tree hover
            // This does not affect title bar hover state
            draft.hovered_node_id = target;
            draft.hovered_node_source = "hierarchy-tree";
            // Validate state consistency
            __validateHoverState(draft);
          });
        }
        case "leave": {
          return updateState(state, (draft) => {
            // Only clear if this is the currently hovered node and it's from hierarchy tree
            // This ensures we don't clear hover from other sources
            if (
              draft.hovered_node_id === target &&
              draft.hovered_node_source === "hierarchy-tree"
            ) {
              draft.hovered_node_id = null;
              draft.hovered_node_source = null;
            }
            // Validate state consistency
            __validateHoverState(draft);
          });
        }
      }
      break;
    }
    case "copy":
    case "cut": {
      if (state.content_edit_mode?.type === "paint/image") {
        const { node_id, paint_target, paint_index } = state.content_edit_mode;
        const node = dq.__getNodeById(state, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        const { paints, resolvedIndex } = editor.resolvePaints(
          node as grida.program.nodes.UnknwonNode,
          paint_target,
          paint_index
        );
        const targetPaint = paints[resolvedIndex];
        if (!cg.isImagePaint(targetPaint)) {
          return state;
        }
        const serialized = JSON.parse(
          JSON.stringify(targetPaint)
        ) as cg.ImagePaint;
        return updateState(state, (draft) => {
          draft.user_clipboard = {
            payload_id: v4(),
            type: "property/fill-image-paint",
            document_key: draft.document_key,
            node_id,
            paint_target,
            paint_index: resolvedIndex,
            paint: serialized,
          };
        });
      }
      if (state.content_edit_mode?.type === "vector") {
        const {
          node_id,
          selection: {
            selected_vertices,
            selected_segments,
            selected_tangents,
          },
        } = state.content_edit_mode;
        const node = dq.__getNodeById(
          state,
          node_id
        ) as grida.program.nodes.VectorNode;
        const vne = new vn.VectorNetworkEditor(node.vector_network);
        const vertices = Array.from(
          new Set([...selected_vertices, ...selected_tangents.map(([v]) => v)])
        );
        const copied = vne.copy({
          vertices,
          segments: selected_segments,
        });
        return updateState(state, (draft) => {
          const mode =
            draft.content_edit_mode as editor.state.VectorContentEditMode;
          mode.clipboard = copied;
          mode.clipboard_node_position = [node.left ?? 0, node.top ?? 0];
          draft.user_clipboard = undefined;
          if (action.type === "cut") {
            __self_delete_vector_network_selection(draft, mode);
          }
        });
      }

      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      return updateState(state, (draft) => {
        // [copy]
        draft.user_clipboard = {
          payload_id: v4(),
          type: "prototypes",
          ids: target_node_ids,
          prototypes: target_node_ids.map((id) =>
            grida.program.nodes.factory.createPrototypeFromSnapshot(
              draft.document,
              id
            )
          ),
        };

        if (action.type === "cut") {
          target_node_ids.forEach((node_id) => {
            self_try_remove_node(draft, node_id);
          });
        }
      });
    }
    case "paste": {
      if (state.user_clipboard?.type === "property/fill-image-paint") {
        const clipboard = state.user_clipboard;
        if (
          clipboard.document_key &&
          state.document_key &&
          clipboard.document_key !== state.document_key
        ) {
          return state;
        }
        if (state.selection.length === 0) {
          return state;
        }
        const selectionIds = [...state.selection];
        return updateState(state, (draft) => {
          const payload = draft.user_clipboard;
          if (!payload || payload.type !== "property/fill-image-paint") {
            return;
          }
          if (
            payload.document_key &&
            draft.document_key &&
            payload.document_key !== draft.document_key
          ) {
            return;
          }
          const target = payload.paint_target;
          const pluralKey =
            target === "stroke" ? "stroke_paints" : "fill_paints";
          const singularKey = target === "stroke" ? "stroke" : "fill";
          let applied = false;

          for (const node_id of selectionIds) {
            const node = dq.__getNodeById(draft, node_id);
            if (!node) continue;

            const existing: cg.Paint[] = Array.isArray((node as any)[pluralKey])
              ? ([...(node as any)[pluralKey]] as cg.Paint[])
              : (node as any)[singularKey]
                ? [(node as any)[singularKey] as cg.Paint]
                : [];

            const clonedPaint = JSON.parse(
              JSON.stringify(payload.paint)
            ) as cg.ImagePaint;

            // Simply push the paint to the end without any checks
            existing.push(clonedPaint);

            (node as any)[pluralKey] = existing;
            if (existing.length > 0) {
              (node as any)[singularKey] = existing[0];
            }
            applied = true;
          }

          if (!applied) {
            return;
          }
        });
      }

      if (state.content_edit_mode?.type === "vector") {
        const net = state.content_edit_mode.clipboard;
        if (!net) break;
        return updateState(state, (draft) => {
          const mode =
            draft.content_edit_mode as editor.state.VectorContentEditMode;
          const node = dq.__getNodeById(
            draft,
            mode.node_id
          ) as grida.program.nodes.VectorNode;
          const vertex_offset = node.vector_network.vertices.length;
          const segment_offset = node.vector_network.segments.length;

          let net_to_union = net;
          if (mode.clipboard_node_position) {
            const delta: [number, number] = [
              mode.clipboard_node_position[0] - (node.left ?? 0),
              mode.clipboard_node_position[1] - (node.top ?? 0),
            ];
            net_to_union = vn.VectorNetworkEditor.translate(net, delta);
          }

          node.vector_network = vn.VectorNetworkEditor.union(
            node.vector_network,
            net_to_union,
            null
          );
          normalizeVectorNodeBBox(node);
          const new_vertices = Array.from(
            { length: net.vertices.length },
            (_, i) => i + vertex_offset
          );
          const new_segments = Array.from(
            { length: net.segments.length },
            (_, i) => i + segment_offset
          );
          mode.selection = {
            selected_vertices: new_vertices,
            selected_segments: new_segments,
            selected_tangents: [],
          };
          mode.selection_neighbouring_vertices = getUXNeighbouringVertices(
            node.vector_network,
            {
              selected_vertices: new_vertices,
              selected_segments: new_segments,
              selected_tangents: [],
            }
          );
          mode.a_point = getVectorSelectionStartPoint({
            selected_vertices: new_vertices,
            selected_tangents: [],
          });
          mode.clipboard = net;
        });
      }

      if (!state.user_clipboard) break;
      if (state.user_clipboard.type !== "prototypes") break;
      if (!action.target) break;
      const { user_clipboard } = state;
      const { ids, prototypes } = user_clipboard;

      const target_parents: string[] = Array.isArray(action.target)
        ? action.target
        : [action.target];

      const { width, height } = context.viewport;
      const _inset_rect = cmath.rect.inset(
        { x: 0, y: 0, width, height },
        PLACEMENT_VIEWPORT_INSET
      );
      const viewport_rect = cmath.rect.transform(
        _inset_rect,
        cmath.transform.invert(state.transform)
      );

      return updateState(state, (draft) => {
        for (const target_parent of target_parents) {
          for (const prototype of prototypes) {
            const sub =
              grida.program.nodes.factory.create_packed_scene_document_from_prototype(
                prototype,
                () => context.idgen.next()
              );

            const box = getPackedSubtreeBoundingRect(sub);
            const delta = getViewportAwareDelta(viewport_rect, box);
            if (delta) {
              sub.scene.children_refs.forEach((node_id) => {
                const node = sub.nodes[node_id];
                if ("position" in node && node.position === "absolute") {
                  node.left = (node.left ?? 0) + delta[0];
                  node.top = (node.top ?? 0) + delta[1];
                }
              });
              box.x += delta[0];
              box.y += delta[1];
            }

            const parent = target_parent;

            if (parent) {
              const parent_rect =
                context.geometry.getNodeAbsoluteBoundingRect(parent);
              if (parent_rect) {
                sub.scene.children_refs.forEach((node_id) => {
                  const node = sub.nodes[node_id];
                  if ("position" in node && node.position === "absolute") {
                    node.left = (node.left ?? 0) - parent_rect.x;
                    node.top = (node.top ?? 0) - parent_rect.y;
                  }
                });
              }
            }

            self_insertSubDocument(draft, parent, sub);
          }
        }
      });
    }
    case "paste-vector-network": {
      const { vector_network, target } = action;

      if (state.content_edit_mode?.type === "vector") {
        const net = vector_network;
        return updateState(state, (draft) => {
          const mode =
            draft.content_edit_mode as editor.state.VectorContentEditMode;
          const node = dq.__getNodeById(
            draft,
            mode.node_id
          ) as grida.program.nodes.VectorNode;
          const vertex_offset = node.vector_network.vertices.length;
          const segment_offset = node.vector_network.segments.length;

          let net_to_union = net;
          if (mode.clipboard && mode.clipboard_node_position) {
            const delta: [number, number] = [
              mode.clipboard_node_position[0] - (node.left ?? 0),
              mode.clipboard_node_position[1] - (node.top ?? 0),
            ];
            if (JSON.stringify(mode.clipboard) === JSON.stringify(net)) {
              net_to_union = vn.VectorNetworkEditor.translate(net, delta);
            }
          }

          node.vector_network = vn.VectorNetworkEditor.union(
            node.vector_network,
            net_to_union,
            null
          );
          normalizeVectorNodeBBox(node);
          const new_vertices = Array.from(
            { length: net.vertices.length },
            (_, i) => i + vertex_offset
          );
          const new_segments = Array.from(
            { length: net.segments.length },
            (_, i) => i + segment_offset
          );
          mode.selection = {
            selected_vertices: new_vertices,
            selected_segments: new_segments,
            selected_tangents: [],
          };
          mode.selection_neighbouring_vertices = getUXNeighbouringVertices(
            node.vector_network,
            {
              selected_vertices: new_vertices,
              selected_segments: new_segments,
              selected_tangents: [],
            }
          );
          mode.a_point = getVectorSelectionStartPoint({
            selected_vertices: new_vertices,
            selected_tangents: [],
          });
          mode.clipboard = net;
        });
      }

      return updateState(state, (draft) => {
        const net = vector_network;
        const id = context.idgen.next();
        const black = kolor.colorformats.RGBA32F.BLACK;
        const node: grida.program.nodes.VectorNode = {
          type: "vector",
          name: "vector",
          id,
          active: true,
          locked: false,
          position: "absolute",
          left: 0,
          top: 0,
          opacity: 1,
          width: 0,
          height: 0,
          rotation: 0,
          z_index: 0,
          stroke: { type: "solid", color: black, active: true },
          stroke_cap: "butt",
          stroke_join: "miter",
          stroke_width: 1,
          vector_network: net,
        };

        normalizeVectorNodeBBox(node);

        const target_parent = target;

        self_try_insert_node(draft, target_parent, node);

        self_select_tool(draft, { type: "cursor" }, context);
        self_selectNode(draft, "reset", node.id);
      });
    }
    case "duplicate": {
      const { target } = action;
      return updateState(state, (draft) => {
        const target_node_ids =
          target === "selection" ? state.selection : [target];
        self_duplicateNode(draft, new Set(target_node_ids), context);
      });
      break;
    }
    case "flatten": {
      const { target } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];

      const flattenable: string[] = [];
      const ignored: string[] = [];
      for (const node_id of target_node_ids) {
        const node = dq.__getNodeById(state, node_id);
        if (node && supportsFlatten(node)) {
          flattenable.push(node_id);
        } else {
          ignored.push(node_id);
        }
      }

      return updateState(state, (draft) => {
        const flattened = flatten_with_union(draft, flattenable, context);
        draft.selection = [...flattened, ...ignored];
      });
    }
    case "delete": {
      const target_node_ids = action.target;

      return updateState(state, (draft) => {
        __self_delete_nodes(draft, target_node_ids, "on");
      });
    }
    case "insert": {
      let sub: grida.program.document.IPackedSceneDocument;
      if ("prototype" in action) {
        const { id, prototype } = action;
        sub =
          grida.program.nodes.factory.create_packed_scene_document_from_prototype(
            prototype,
            (_, depth) =>
              depth === 0 ? (id ?? context.idgen.next()) : context.idgen.next()
          );
      } else if ("document" in action) {
        sub = action.document;
      } else {
        throw new Error(
          "Invalid action - prototype or document is required for `insert()`"
        );
      }

      const box = getPackedSubtreeBoundingRect(sub);

      // [root rect for calculating next placement]
      // if the insertion parent is null (root), use viewport rect (canvas space)
      // otherwise, use the parent's bounding rect (canvas space) (TODO:)
      const { width, height } = context.viewport;

      // apply the inset before convering to canvas space
      const _inset_rect = cmath.rect.inset(
        {
          x: 0,
          y: 0,
          width,
          height,
        },
        PLACEMENT_VIEWPORT_INSET
      );

      const viewport_rect = cmath.rect.transform(
        _inset_rect,
        cmath.transform.invert(state.transform)
      );

      // use target's children as siblings (if null, root children) // TODO: parent siblings are not supported
      assert(state.scene_id, "scene_id is required for insertion");
      const siblings = state.document.links[state.scene_id] || [];
      const anchors = siblings
        .map((node_id) => {
          const r = context.geometry.getNodeAbsoluteBoundingRect(node_id);
          if (!r) return null;
          return cmath.rect.pad(
            { x: r.x, y: r.y, width: r.width, height: r.height },
            PLACEMENT_ANCHORS_PADDING
          );
        })
        .filter((r) => r !== null) as cmath.Rectangle[];

      const placement = cmath.packing.ext.walk_to_fit(
        viewport_rect,
        box,
        anchors
      );

      assert(placement); // placement is always expected since allowOverflow is true

      sub.scene.children_refs.forEach((node_id) => {
        const node = sub.nodes[node_id];
        if ("position" in node && node.position === "absolute") {
          node.left = (node.left ?? 0) + placement.x;
          node.top = (node.top ?? 0) + placement.y;
        }
      });

      const parent: string | null = action.target;

      if (parent) {
        const parent_rect =
          context.geometry.getNodeAbsoluteBoundingRect(parent);
        if (parent_rect) {
          sub.scene.children_refs.forEach((node_id) => {
            const node = sub.nodes[node_id];
            if ("position" in node && node.position === "absolute") {
              node.left = (node.left ?? 0) - parent_rect.x;
              node.top = (node.top ?? 0) - parent_rect.y;
            }
          });
        }
      }

      return updateState(state, (draft) => {
        self_insertSubDocument(draft, parent, sub);
      });
    }
    case "order": {
      const { target: target_node_ids, order } = action;

      return updateState(state, (draft) => {
        for (const node_id of target_node_ids) {
          __self_order(draft, node_id, order);
        }
      });
    }
    case "mv": {
      const { source, target, index } = action;
      return updateState(state, (draft) => {
        for (const node_id of source) {
          self_moveNode(draft, node_id, target, index);
        }
      });
      break;
    }
    case "nudge": {
      const { target, axis, delta } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];
      const dx = axis === "x" ? delta : 0;
      const dy = axis === "y" ? delta : 0;

      if (target_node_ids.length === 0) return state;
      return updateState(state, (draft) => {
        self_nudge_transform(draft, target_node_ids, dx, dy, context);
      });
    }
    case "nudge-resize": {
      const { target, axis, delta } = action;
      const target_node_ids =
        target === "selection" ? state.selection : [target];
      const dx = axis === "x" ? delta : 0;
      const dy = axis === "y" ? delta : 0;

      return updateState(state, (draft) => {
        for (const node_id of target_node_ids) {
          const node = draft.document.nodes[node_id];
          updateNodeTransform(node, {
            type: "resize",
            delta: [dx, dy],
          });
        }
      });
    }
    case "a11y/up":
    case "a11y/right":
    case "a11y/down":
    case "a11y/left": {
      const { target, shiftKey } = action;
      const direction = action.type as
        | "a11y/up"
        | "a11y/right"
        | "a11y/down"
        | "a11y/left";

      const direction_1d =
        direction === "a11y/right" || direction === "a11y/down" ? 1 : -1;

      const nudge_mod = shiftKey ? 10 : 1;

      const target_node_ids =
        target === "selection" ? state.selection : [target];

      // handle a11y for content edit mode
      if (state.content_edit_mode) {
        switch (state.content_edit_mode.type) {
          case "paint/gradient": {
            const {
              node_id,
              selected_stop,
              paint_index = 0,
              paint_target = "fill",
            } = state.content_edit_mode;
            return updateState(state, (draft) => {
              const node = dq.__getNodeById(draft, node_id);
              const { paints, resolvedIndex } = editor.resolvePaints(
                node as grida.program.nodes.UnknwonNode,
                paint_target,
                paint_index
              );
              const target = paints[resolvedIndex];
              const gradient: cg.GradientPaint | undefined =
                target && cg.isGradientPaint(target)
                  ? (target as cg.GradientPaint)
                  : undefined;
              const mod = shiftKey ? 0.1 : 0.01;

              if (!gradient) return;

              const stop = gradient.stops[selected_stop];
              stop.offset = Math.min(
                1,
                Math.max(0, stop.offset + direction_1d * mod)
              );

              // Update the paint in the array
              if (paints.length > 0) {
                paints[resolvedIndex] = gradient;
                // Update singular property for legacy compatibility
                const singularKey =
                  paint_target === "stroke" ? "stroke" : "fill";
                (node as any)[singularKey] = paints[0];
              }
            });
            break;
          }
          case "vector": {
            const base_movement: cmath.ext.movement.Movement = [
              nudge_mod * editor.a11y.a11y_direction_to_vector[direction][0],
              nudge_mod * editor.a11y.a11y_direction_to_vector[direction][1],
            ];
            return updateState(state, (draft) => {
              const { node_id, selection } =
                draft.content_edit_mode as editor.state.VectorContentEditMode;

              const node = dq.__getNodeById(
                draft,
                node_id
              ) as grida.program.nodes.VectorNode;

              const { vertices, tangents } = encodeTranslateVectorCommand(
                node.vector_network,
                selection
              );

              const scene = getScene(draft.document, draft.scene_id!);
              const agent_points = vertices.map((i) =>
                cmath.vector2.add(node.vector_network.vertices[i], [
                  node.left!,
                  node.top!,
                ])
              );
              const anchor_points = node.vector_network.vertices
                .map((v, i) => ({ p: v, i }))
                .filter(({ i }) => !vertices.includes(i))
                .map(({ p }) => cmath.vector2.add(p, [node.left!, node.top!]));

              const should_snap =
                draft.gesture_modifiers.translate_with_force_disable_snap !==
                "on";

              const { movement: snappedMovement, snapping } = snapMovement(
                agent_points,
                { points: anchor_points, guides: scene.guides },
                base_movement,
                editor.config.DEFAULT_SNAP_NUDGE_THRESHOLD,
                should_snap
              );

              draft.surface_snapping = snapping;

              const delta_vec = cmath.ext.movement.normalize(snappedMovement);

              self_updateVectorNodeVectorNetwork(node, (vne) => {
                for (const v of vertices) {
                  vne.translateVertex(v, delta_vec);
                }
                for (const [vi, ti] of tangents) {
                  const point = ti === 0 ? "a" : "b";
                  const control = ti === 0 ? "ta" : "tb";
                  for (const si of vne.findSegments(vi, point)) {
                    const next = cmath.vector2.add(
                      vne.segments[si][control],
                      delta_vec
                    );
                    vne.updateTangent(si, control, next, "none");
                  }
                }
              });
            });
            break;
          }
        }
      }
      // if movement target exists, nudge the nodes
      else if (target_node_ids.length > 0) {
        const nodes = target_node_ids.map((node_id) =>
          dq.__getNodeById(state, node_id)
        );

        const in_flow_node_ids = nodes
          .filter((node) => {
            if ("position" in node) {
              return (
                node.position === "relative" &&
                node.top === undefined &&
                node.right === undefined &&
                node.bottom === undefined &&
                node.left === undefined
              );
            }
          })
          .map((node) => node.id);

        const out_flow_node_ids = nodes
          .filter((node) => {
            return !in_flow_node_ids.includes(node.id);
          })
          .map((node) => node.id);

        return updateState(state, (draft) => {
          for (const node_id of in_flow_node_ids) {
            __self_order(
              draft,
              node_id,
              editor.a11y.a11y_direction_to_order[direction]
            );
          }

          if (out_flow_node_ids.length > 0) {
            const [dx, dy] = cmath.vector2.multiply(
              editor.a11y.a11y_direction_to_vector[direction],
              [nudge_mod, nudge_mod]
            );

            self_nudge_transform(draft, out_flow_node_ids, dx, dy, context);
          }
        });
      }
      // delta transform the camera (pan)
      else {
        return updateState(state, (draft) => {
          const [scaleX, scaleY] = cmath.transform.getScale(draft.transform);
          const delta: cmath.Vector2 = [
            -nudge_mod *
              editor.config.DEFAULT_CAMERA_KEYBOARD_MOVEMENT *
              editor.a11y.a11y_direction_to_vector[direction][0] *
              scaleX,
            -nudge_mod *
              editor.config.DEFAULT_CAMERA_KEYBOARD_MOVEMENT *
              editor.a11y.a11y_direction_to_vector[direction][1] *
              scaleY,
          ];

          draft.transform = cmath.transform.translate(draft.transform, delta);
        });
      }

      //
      //
      break;
    }
    case "a11y/align": {
      const { alignment } = action;
      return documentReducer(
        state,
        {
          type: "align",
          target: "selection",
          alignment,
        },
        context
      );
    }
    case "align": {
      const {
        target,
        alignment: { horizontal, vertical },
      } = action;

      const target_node_ids =
        target === "selection" ? state.selection : [target];

      if (target_node_ids.length === 1) {
        // if a single node is selected, align it with its container. (if not root)
        const node_id = target_node_ids[0];
        const top_id = dq.getTopIdWithinScene(
          state.document_ctx,
          node_id,
          state.scene_id
        );
        if (top_id && node_id !== top_id) {
          const parent_node_id = dq.getParentId(state.document_ctx, node_id);
          assert(parent_node_id, "parent node not found");

          const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id)!;
          const parent_rect =
            context.geometry.getNodeAbsoluteBoundingRect(parent_node_id)!;

          const aligned = cmath.rect.alignA(rect, parent_rect, {
            horizontal,
            vertical,
          });

          const dx = aligned.x - rect.x;
          const dy = aligned.y - rect.y;

          return updateState(state, (draft) => {
            const node = dq.__getNodeById(draft, node_id);
            updateNodeTransform(node, {
              type: "translate",
              dx,
              dy,
            });
          });
        }

        return state;
      }

      const rects = target_node_ids.map(
        (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
      );

      const transformed = cmath.rect.align(rects, { horizontal, vertical });
      const deltas = transformed.map((rect, i) => {
        const target_rect = rects[i];
        const dx = rect.x - target_rect.x;
        const dy = rect.y - target_rect.y;

        return { dx, dy };
      });

      return updateState(state, (draft) => {
        let i = 0;
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(draft, node_id);
          updateNodeTransform(node, {
            type: "translate",
            dx: deltas[i].dx,
            dy: deltas[i].dy,
          });
          i++;
        }
      });

      break;
    }
    case "distribute-evenly": {
      const { target, axis } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      const rects = target_node_ids.map(
        (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
      );

      // Only allow distribute-evenly of 3 or more nodes
      if (target_node_ids.length < 3) return state;

      //
      const transformed = cmath.rect.distributeEvenly(rects, axis);

      const deltas = transformed.map((rect, i) => {
        const target_rect = rects[i];
        const dx = rect.x - target_rect.x;
        const dy = rect.y - target_rect.y;

        return { dx, dy };
      });

      return updateState(state, (draft) => {
        let i = 0;
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(draft, node_id);
          updateNodeTransform(node, {
            type: "translate",
            dx: deltas[i].dx,
            dy: deltas[i].dy,
          });
          i++;
        }
      });

      break;
    }
    case "autolayout": {
      const { contain } = action;

      // [contain: false] - apply layout to existing container
      if (!contain) {
        const container_id = action.target;
        const container_node = dq.__getNodeById(state, container_id);
        assert(
          container_node.type === "container",
          `autolayout with contain: false requires a container node, got ${container_node.type}`
        );

        const children = dq.getChildren(state.document_ctx, container_id);
        if (children.length === 0) {
          return state; // no-op if no children
        }

        const container_rect =
          context.geometry.getNodeAbsoluteBoundingRect(container_id)!;
        const delta: cmath.Vector2 = [-container_rect.x, -container_rect.y];

        const rects = children
          .map(
            (node_id) => context.geometry.getNodeAbsoluteBoundingRect(node_id)!
          )
          // make the rects relative to the parent
          .map((rect) => cmath.rect.translate(rect, delta))
          .map((rect) => cmath.rect.quantize(rect, 1));

        // guess the layout
        const lay = layout.flex.guess(rects);

        return updateState(state, (draft) => {
          const container = dq.__getNodeById(
            draft,
            container_id
          ) as grida.program.nodes.ContainerNode;

          // Apply flex layout properties to the existing container
          container.layout = "flex";
          container.direction = lay.direction;
          container.main_axis_gap = cmath.quantize(lay.spacing, 1);
          container.cross_axis_gap = cmath.quantize(lay.spacing, 1);
          container.main_axis_alignment = lay.mainAxisAlignment;
          container.cross_axis_alignment = lay.crossAxisAlignment;

          // [reorder children according to guessed layout]
          const ordered = lay.orders.map((i) => children[i]);
          ordered.forEach((child_id, index) => {
            self_moveNode(draft, child_id, container_id, index);
          });

          // [reset children position]
          ordered.forEach((child_id) => {
            const child = dq.__getNodeById(draft, child_id);
            (draft.document.nodes[
              child_id
            ] as grida.program.nodes.i.IPositioning) = {
              ...child,
              position: "relative",
              top: undefined,
              right: undefined,
              bottom: undefined,
              left: undefined,
            };
          });

          self_selectNode(draft, "reset", container_id);
        });
      }
      // [contain: true] - wrap nodes in new container(s)
      else {
        const { target } = action;
        const target_node_ids =
          target === "selection" ? state.selection : target;

        // group by parent, including root nodes
        const groups = Object.groupBy(
          target_node_ids,
          (node_id) =>
            dq.getParentId(state.document_ctx, node_id) ?? state.scene_id!
        );

        const layouts = Object.keys(groups).map((parent_id) => {
          const g = groups[parent_id]!;
          const is_scene = parent_id === state.scene_id;

          let delta: cmath.Vector2;
          if (is_scene) {
            delta = [0, 0];
          } else {
            const parent_rect =
              context.geometry.getNodeAbsoluteBoundingRect(parent_id)!;
            delta = [-parent_rect.x, -parent_rect.y];
          }

          const rects = g
            .map(
              (node_id) =>
                context.geometry.getNodeAbsoluteBoundingRect(node_id)!
            )
            // make the rects relative to the parent
            .map((rect) => cmath.rect.translate(rect, delta))
            .map((rect) => cmath.rect.quantize(rect, 1));

          // guess the layout
          const lay = layout.flex.guess(rects);

          return {
            parent: is_scene ? null : parent_id,
            layout: lay,
            children: g,
          };
        });

        return updateState(state, (draft) => {
          const insertions: grida.program.nodes.NodeID[] = [];
          layouts.forEach(({ parent, layout, children }) => {
            const container_prototype: grida.program.nodes.NodePrototype = {
              type: "container",
              // layout
              layout: "flex",
              width: "auto",
              height: "auto",
              top: cmath.quantize(layout.union.y, 1),
              left: cmath.quantize(layout.union.x, 1),
              direction: layout.direction,
              main_axis_gap: cmath.quantize(layout.spacing, 1),
              cross_axis_gap: cmath.quantize(layout.spacing, 1),
              main_axis_alignment: layout.mainAxisAlignment,
              cross_axis_alignment: layout.crossAxisAlignment,
              padding_top: children.length === 1 ? 16 : 0,
              padding_right: children.length === 1 ? 16 : 0,
              padding_bottom: children.length === 1 ? 16 : 0,
              padding_left: children.length === 1 ? 16 : 0,
              // corner radius
              corner_radius: 0,
              rectangular_corner_radius_top_left: 0,
              rectangular_corner_radius_top_right: 0,
              rectangular_corner_radius_bottom_right: 0,
              rectangular_corner_radius_bottom_left: 0,
              // children (empty when init)
              children: [],
              // position
              position: "absolute",
            };

            const container_id = self_insertSubDocument(
              draft,
              parent,
              grida.program.nodes.factory.create_packed_scene_document_from_prototype(
                container_prototype,
                () => context.idgen.next()
              )
            )[0];

            // [move children to container]
            const ordered = layout.orders.map((i) => children[i]);
            ordered.forEach((child_id) => {
              self_moveNode(draft, child_id, container_id);
            });

            // [reset children position]
            ordered.forEach((child_id) => {
              const child = dq.__getNodeById(draft, child_id);
              (draft.document.nodes[
                child_id
              ] as grida.program.nodes.i.IPositioning) = {
                ...child,
                position: "relative",
                top: undefined,
                right: undefined,
                bottom: undefined,
                left: undefined,
              };
            });

            insertions.push(container_id);
          });

          self_selectNode(draft, "reset", ...insertions);
        });
      }

      break;
    }
    case "contain": {
      const { target } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      return updateState(state, (draft) => {
        const insertions = self_wrapNodes(
          draft,
          target_node_ids,
          "container",
          context
        );
        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    case "group": {
      const { target } = action;
      const target_node_ids = target === "selection" ? state.selection : target;

      return updateState(state, (draft) => {
        const insertions = self_wrapNodes(
          draft,
          target_node_ids,
          "group",
          context
        );
        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    case "ungroup": {
      const { target } = action;

      return updateState(state, (draft) => {
        self_ungroup(draft, target, context.geometry);
      });
    }
    case "group-op": {
      const { target, op } = action;
      const target_node_ids = target;

      // Check if we have exactly one target and it's already a boolean operation node
      if (target_node_ids.length === 1) {
        const node = dq.__getNodeById(state, target_node_ids[0]);
        if (node && node.type === "boolean") {
          // Simply change the op value of the existing boolean operation node
          return updateState(state, (draft) => {
            const booleanNode = dq.__getNodeById(
              draft,
              target_node_ids[0]
            ) as grida.program.nodes.BooleanPathOperationNode;
            booleanNode.op = op;
          });
        }
      }

      // Original behavior: wrap multiple nodes in a new boolean operation
      const flattenable: string[] = [];
      const ignored: string[] = [];
      for (const node_id of target_node_ids) {
        const node = dq.__getNodeById(state, node_id);
        if (node && supportsFlatten(node)) {
          flattenable.push(node_id);
        } else {
          ignored.push(node_id);
        }
      }

      return updateState(state, (draft) => {
        const insertions = self_wrapNodesAsBooleanOperation(
          draft,
          flattenable,
          op,
          context
        );
        self_selectNode(draft, "reset", ...insertions);
      });
      break;
    }
    case "apply-scale": {
      const { targets, factor, origin, include_subtree, space } = action;
      return updateState(state, (draft) => {
        self_apply_scale_by_factor(draft, context, {
          targets,
          factor,
          origin,
          include_subtree,
          space,
        });
      });
    }
    //
    case "select-vertex":
    case "delete-vertex":
    case "select-segment":
    case "delete-segment":
    case "translate-segment":
    case "bend-segment":
    case "select-tangent":
    case "delete-tangent":
    case "translate-vertex":
    case "split-segment": {
      return updateState(state, (draft) => {
        const { node_id } = action.target;
        const node = dq.__getNodeById(draft, node_id);

        switch (action.type) {
          case "select-vertex": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            const next = reduceVectorContentSelection(
              draft.content_edit_mode.selection,
              {
                type: "vertex",
                index: action.target.vertex,
                additive: action.additive,
              }
            );
            draft.content_edit_mode.selection = next;
            draft.content_edit_mode.selection_neighbouring_vertices =
              getUXNeighbouringVertices(
                (node as grida.program.nodes.VectorNode).vector_network,
                {
                  selected_vertices: next.selected_vertices,
                  selected_segments: next.selected_segments,
                  selected_tangents: next.selected_tangents,
                }
              );
            draft.content_edit_mode.a_point =
              getVectorSelectionStartPoint(next);
            break;
          }
          case "delete-vertex": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.deleteVertex(action.target.vertex);
            });

            if (draft.content_edit_mode?.type === "vector") {
              if (
                draft.content_edit_mode.selection.selected_vertices.includes(
                  action.target.vertex
                ) ||
                draft.content_edit_mode.selection.selected_tangents.some(
                  ([v]) => v === action.target.vertex
                )
              ) {
                // clear the selection as deleted
                draft.content_edit_mode.selection = {
                  selected_vertices: [],
                  selected_segments: [],
                  selected_tangents: [],
                };
                draft.content_edit_mode.a_point = null;
              }
            }
            break;
          }
          case "select-segment": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            const next = reduceVectorContentSelection(
              draft.content_edit_mode.selection,
              {
                type: "segment",
                index: action.target.segment,
                additive: action.additive,
              }
            );
            draft.content_edit_mode.selection = next;
            draft.content_edit_mode.selection_neighbouring_vertices =
              getUXNeighbouringVertices(
                (node as grida.program.nodes.VectorNode).vector_network,
                {
                  selected_vertices: next.selected_vertices,
                  selected_segments: next.selected_segments,
                  selected_tangents: next.selected_tangents,
                }
              );
            draft.content_edit_mode.a_point =
              getVectorSelectionStartPoint(next);
            break;
          }
          case "select-tangent": {
            assert(draft.content_edit_mode?.type === "vector");
            draft.selection = [node_id];
            const next = reduceVectorContentSelection(
              draft.content_edit_mode.selection,
              {
                type: "tangent",
                index: [action.target.vertex, action.target.tangent],
                additive: action.additive,
              }
            );
            draft.content_edit_mode.selection = next;
            draft.content_edit_mode.selection_neighbouring_vertices =
              getUXNeighbouringVertices(
                (node as grida.program.nodes.VectorNode).vector_network,
                next
              );
            draft.content_edit_mode.a_point =
              getVectorSelectionStartPoint(next);
            break;
          }
          case "delete-tangent": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              const point = action.target.tangent === 0 ? "a" : "b";
              for (const si of vne.findSegments(action.target.vertex, point)) {
                const control = action.target.tangent === 0 ? "ta" : "tb";
                vne.deleteTangent(si, control);
              }
            });

            if (draft.content_edit_mode?.type === "vector") {
              draft.content_edit_mode.selection.selected_tangents =
                draft.content_edit_mode.selection.selected_tangents.filter(
                  ([v, t]) =>
                    !(v === action.target.vertex && t === action.target.tangent)
                );
              draft.content_edit_mode.a_point = null;
            }
            break;
          }
          case "translate-vertex": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              const bb_a = vne.getBBox();
              vne.translateVertex(action.target.vertex, action.delta);
              const bb_b = vne.getBBox();
              const delta_vec: cmath.Vector2 = [
                bb_b.x - bb_a.x,
                bb_b.y - bb_a.y,
              ];
              vne.translate(cmath.vector2.invert(delta_vec));
            });
            break;
          }
          case "translate-segment": {
            assert(node.type === "vector");
            self_updateVectorNodeVectorNetwork(node, (vne) => {
              const bb_a = vne.getBBox();
              vne.translateSegment(action.target.segment, action.delta);
              const bb_b = vne.getBBox();
              const delta_vec: cmath.Vector2 = [
                bb_b.x - bb_a.x,
                bb_b.y - bb_a.y,
              ];
              vne.translate(cmath.vector2.invert(delta_vec));
            });
            break;
          }
          case "bend-segment": {
            assert(node.type === "vector");
            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.bendSegment(
                action.target.segment,
                action.ca,
                action.cb,
                action.frozen
              );
            });
            break;
          }
          case "delete-segment": {
            assert(node.type === "vector");

            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.deleteSegment(action.target.segment);
            });

            if (draft.content_edit_mode?.type === "vector") {
              // Clear segment selection since the segment was deleted
              draft.content_edit_mode.selection = {
                selected_vertices: [],
                selected_segments: [],
                selected_tangents: [],
              };
              draft.content_edit_mode.a_point = null;
            }
            break;
          }
          case "split-segment": {
            if (node.type === "vector") {
              const newIndex = self_updateVectorNodeVectorNetwork(node, (vne) =>
                vne.splitSegment(action.target.point)
              );

              if (draft.content_edit_mode?.type === "vector") {
                draft.content_edit_mode.selection = {
                  selected_vertices: [newIndex],
                  selected_segments: [],
                  selected_tangents: [],
                };
                draft.content_edit_mode.a_point = newIndex;
              }
              break;
            }
            break;
          }
        }
      });
    }
    case "vector/planarize": {
      const { target } = action;
      const target_node_ids =
        target === "selection"
          ? state.selection
          : Array.isArray(target)
            ? target
            : [target];

      return updateState(state, (draft) => {
        for (const node_id of target_node_ids) {
          const node = dq.__getNodeById(draft, node_id);

          if (node.type === "vector") {
            self_updateVectorNodeVectorNetwork(node, (vne) => {
              vne.planarize();
            });
          }
        }
      });
    }
    case "vector/delete-selection": {
      return updateState(state, (draft) => {
        const { target } = <EditorVectorDeleteSelectionAction>action;
        const { node_id } = target;

        if (
          draft.content_edit_mode?.type === "vector" &&
          draft.content_edit_mode.node_id === node_id
        ) {
          __self_delete_vector_network_selection(
            draft,
            draft.content_edit_mode as editor.state.VectorContentEditMode
          );
        }
      });
    }
    case "vector/update-hovered-control": {
      return updateState(state, (draft) => {
        if (draft.content_edit_mode?.type === "vector") {
          draft.content_edit_mode.hovered_control = action.hoveredControl;
        }
      });
    }
    //
    case "bend-or-clear-corner": {
      const { target, tangent } = <EditorVectorBendOrClearCornerAction>action;
      const { node_id, vertex, ref } = target;
      return updateState(state, (draft) => {
        const node = dq.__getNodeById(
          draft,
          node_id
        ) as grida.program.nodes.VectorNode;
        self_updateVectorNodeVectorNetwork(node, (vne) => {
          if (typeof tangent !== "undefined") {
            vne.setCornerTangents(vertex, tangent);
            return;
          }

          const segs = vne.findSegments(vertex);
          if (segs.length === 2) {
            const segA = vne.segments[segs[0]];
            const segB = vne.segments[segs[1]];
            const controlA = segA.a === vertex ? "ta" : "tb";
            const controlB = segB.a === vertex ? "ta" : "tb";
            const tA = segA[controlA];
            const tB = segB[controlB];
            const tAExists = !cmath.vector2.isZero(tA);
            const tBExists = !cmath.vector2.isZero(tB);

            if (tAExists && tBExists) {
              vne.setCornerTangents(vertex, 0);
              return;
            }

            if (tAExists || tBExists) {
              const src = tAExists ? tA : tB;
              vne.setCornerTangents(vertex, src);
              return;
            }
          }

          vne.bendCorner(vertex, ref);
        });
      });
    }
    //
    case "select-gradient-stop": {
      return updateState(state, (draft) => {
        const { target } = <EditorSelectGradientStopAction>action;
        const { node_id, stop, paint_index, paint_target } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "paint/gradient") {
          draft.content_edit_mode.node_id = node_id;
          draft.content_edit_mode.selected_stop = stop;
          if (typeof paint_index === "number") {
            draft.content_edit_mode.paint_index = paint_index;
          }
          draft.content_edit_mode.paint_target =
            paint_target ?? draft.content_edit_mode.paint_target ?? "fill";
        }
      });
    }
    case "paint/gradient/delete-stop": {
      return updateState(state, (draft) => {
        const { target } = <EditorDeleteGradientStopAction>action;
        const { node_id, stop, paint_index, paint_target } = target;
        const node = dq.__getNodeById(draft, node_id)!;
        const paintTarget = paint_target ?? "fill";
        const { paints, resolvedIndex } = editor.resolvePaints(
          node as grida.program.nodes.UnknwonNode,
          paintTarget,
          paint_index ?? 0
        );
        const targetPaint = paints[resolvedIndex];

        if (targetPaint && cg.isGradientPaint(targetPaint)) {
          const gradient = targetPaint as cg.GradientPaint;
          if (gradient.stops.length > 2) {
            gradient.stops.splice(stop, 1);

            // Update selected_stop if in content edit mode
            if (draft.content_edit_mode?.type === "paint/gradient") {
              const mode =
                draft.content_edit_mode as editor.state.PaintGradientContentEditMode;
              mode.selected_stop = Math.min(
                mode.selected_stop,
                gradient.stops.length - 1
              );
            }
          }

          // Update the paint in the array
          if (paints.length > 0) {
            paints[resolvedIndex] = gradient;
            // Update singular property for legacy compatibility
            const singularKey = paintTarget === "stroke" ? "stroke" : "fill";
            (node as any)[singularKey] = paints[0];
          }
        }
      });
    }
    //
    case "variable-width/select-stop": {
      return updateState(state, (draft) => {
        const { target } = <EditorVariableWidthSelectStopAction>action;
        const { node_id, stop } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "width") {
          draft.content_edit_mode.variable_width_selected_stop = stop;
        }
      });
    }
    case "variable-width/delete-stop": {
      return updateState(state, (draft) => {
        const { target } = <EditorVariableWidthDeleteStopAction>action;
        const { node_id, stop } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "width") {
          // Remove the stop from the profile
          const profile = draft.content_edit_mode.variable_width_profile;
          profile.stops.splice(stop, 1);

          // Clear selection if the deleted stop was selected
          if (draft.content_edit_mode.variable_width_selected_stop === stop) {
            draft.content_edit_mode.variable_width_selected_stop = null;
          } else if (
            draft.content_edit_mode.variable_width_selected_stop !== null &&
            draft.content_edit_mode.variable_width_selected_stop > stop
          ) {
            // Adjust selection index if it was after the deleted stop
            draft.content_edit_mode.variable_width_selected_stop--;
          }

          // Also update the node's strokeWidthProfile property
          if (node.type === "vector") {
            node.stroke_width_profile = profile;
          }
        }
      });
    }
    case "variable-width/add-stop": {
      return updateState(state, (draft) => {
        const { target } = <EditorVariableWidthAddStopAction>action;
        const { node_id, u, r } = target;
        const node = dq.__getNodeById(draft, node_id);
        assert(node);
        if (draft.content_edit_mode?.type === "width") {
          const profile = draft.content_edit_mode.variable_width_profile;

          // TODO: need to compute the correct initial r at the point, based on its neighbors
          // For now, we will simply be using the middle value of the neighbor, not caring the position diff of them

          // Find the correct position to insert the new stop (maintain sorted order by u)
          const insertIndex = profile.stops.findIndex((stop) => stop.u > u);
          const newStopIndex =
            insertIndex === -1 ? profile.stops.length : insertIndex;

          // Insert the new stop
          profile.stops.splice(newStopIndex, 0, { u, r });

          // Select the newly added stop
          draft.content_edit_mode.variable_width_selected_stop = newStopIndex;

          // Also update the node's strokeWidthProfile property
          if (node.type === "vector") {
            node.stroke_width_profile = profile;
          }
        }
      });
    }
    //
    case "surface/ruler":
    case "surface/guide/delete":
    case "surface/pixel-grid":
    case "surface/content-edit-mode/try-enter":
    case "surface/content-edit-mode/paint/gradient":
    case "surface/content-edit-mode/paint/image":
    case "surface/content-edit-mode/try-exit":
    case "surface/tool":
    case "surface/brush":
    case "surface/brush/size":
    case "surface/brush/opacity":
    case "surface/gesture/start": {
      return surfaceReducer(state, action, context);
    }
    case "document/template/set/props": {
      const { data } = <TemplateEditorSetTemplatePropsAction>action;

      return updateState(state, (draft) => {
        // Get scene children from links
        const scene_children = state.document.links[state.scene_id!] || [];
        const root_template_instance = dq.__getNodeById(
          draft,
          // FIXME: update api interface
          scene_children[0]
        );
        assert(root_template_instance.type === "template_instance");
        root_template_instance.props = data;
      });
    }
    // case "document/template/change/props": {
    //   const { props: partialProps } = <TemplateEditorChangeTemplatePropsAction>(
    //     action
    //   );

    //   return updateState(state, (draft) => {
    //     draft.template.props = {
    //       ...(draft.template.props || {}),
    //       ...partialProps,
    //     } as grida.program.schema.Props;
    //   });
    // }

    case "node/change/*":
    case "node/change/positioning":
    case "node/change/positioning-mode":
    case "node/change/component":
    case "node/change/props":
    case "node/change/style":
    case "node/change/fontFamily": {
      const { node_id } = <NodeChangeAction>action;
      return updateState(state, (draft) => {
        const node = dq.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        draft.document.nodes[node_id] = nodeReducer(node, action);

        // font family specific hook
        if (action.type === "node/change/fontFamily") {
          if (action.fontFamily) {
            draft.fontfaces.push({
              family: action.fontFamily,
              // FIXME: support italic flag
              italic: false,
            });
          }
        }
      });
    }
    //
    case "node/toggle/underline": {
      return updateState(state, (draft) => {
        const { node_id } = <NodeToggleUnderlineAction>action;
        const node = dq.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        if (node.type !== "text") return;

        const isUnderline = node.text_decoration_line === "underline";
        node.text_decoration_line = isUnderline ? "none" : "underline";
      });
      //
    }
    case "node/toggle/line-through": {
      return updateState(state, (draft) => {
        const { node_id } = <NodeToggleLineThroughAction>action;
        const node = dq.__getNodeById(draft, node_id);
        assert(node, `node not found with node_id: "${node_id}"`);
        if (node.type !== "text") return;

        const isLineThrough = node.text_decoration_line === "line-through";
        node.text_decoration_line = isLineThrough ? "none" : "line-through";
      });
      //
    }
    //
    case "document/template/override/change/*": {
      const { template_instance_node_id, action: __action } = <
        TemplateNodeOverrideChangeAction
      >action;

      return updateState(state, (draft) => {
        const { node_id } = __action;
        const template_instance_node = dq.__getNodeById(
          draft,
          template_instance_node_id
        );

        assert(
          template_instance_node &&
            template_instance_node.type === "template_instance"
        );

        const nodedata = template_instance_node.overrides[node_id] || {};
        template_instance_node.overrides[node_id] = nodeReducer(
          nodedata,
          __action
        );
      });
    }
    //
    //
    //
    case "document/properties/define":
    case "document/properties/rename":
    case "document/properties/update":
    case "document/properties/put":
    case "document/properties/delete": {
      return updateState(state, (draft) => {
        // TODO:
        // const root_node = document.__getNodeById(draft, draft.document.root_id);
        // assert(root_node.type === "component");
        draft.document.properties = schemaReducer(
          state.document.properties,
          action
        );
        //
      });
    }

    default: {
      throw new Error(
        `unknown action type: "${(action as DocumentAction).type}"`
      );
    }
  }

  return state;
}

/**
 * Flattens nodes into unioned vector nodes grouped by their parent hierarchy.
 * Each group of sibling nodes is merged into a single vector node, inserted at
 * the earliest sibling order, and the originals are removed. The resulting
 * nodes are positioned relative to their parent using the shapes' real bounding
 * boxes so visuals remain unchanged.
 *
 * @returns ids of newly created vector nodes.
 */
function flatten_with_union<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  supported_node_ids: string[],
  context: ReducerContext
): string[] {
  if (supported_node_ids.length === 0) return [];

  const groups = Object.groupBy(
    supported_node_ids,
    (id) => dq.getParentId(draft.document_ctx, id) ?? draft.scene_id!
  );

  const ids: string[] = [];

  Object.entries(groups).forEach(([parent, group]) => {
    if (!group) return;
    const inserted = __flatten_group_with_union(
      draft,
      group,
      parent === draft.scene_id ? null : parent,
      context
    );
    if (inserted) ids.push(inserted);
  });

  return ids;
}

function __flatten_group_with_union<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  group: string[],
  parent_id: string | null,
  context: ReducerContext
): string | null {
  if (group.length === 0) return null;

  const scene_children = draft.document.links[draft.scene_id!] || [];
  const siblings = parent_id
    ? draft.document_ctx.lu_children[parent_id] || []
    : scene_children;
  const order = Math.min(
    ...group.map((id) => siblings.indexOf(id)).filter((i) => i >= 0)
  );

  const parent_rect = parent_id
    ? context.geometry.getNodeAbsoluteBoundingRect(parent_id)!
    : { x: 0, y: 0, width: 0, height: 0 };

  let union_net: vn.VectorNetwork | null = null;
  for (const node_id of group) {
    const rect = context.geometry.getNodeAbsoluteBoundingRect(node_id);
    const flattened = self_flattenNode(draft, node_id, context);
    if (!rect || !flattened) continue;
    const { node: v, delta } = flattened;
    const abs_pos: cmath.Vector2 = [rect.x + delta[0], rect.y + delta[1]];
    const vne = new vn.VectorNetworkEditor(v.vector_network);
    vne.translate(abs_pos);
    union_net = union_net
      ? vn.VectorNetworkEditor.union(union_net, vne.value)
      : vne.value;
  }

  if (!union_net) return null;

  const base = dq.__getNodeById(
    draft,
    group[0]
  ) as grida.program.nodes.VectorNode;
  const id = context.idgen.next();
  const node: grida.program.nodes.VectorNode = {
    ...base,
    id,
    vector_network: union_net,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };

  normalizeVectorNodeBBox(node);
  node.left! -= parent_rect.x;
  node.top! -= parent_rect.y;

  self_try_insert_node(draft, parent_id, node);
  __self_delete_nodes(draft, group, "on");
  // Use scene_id instead of "<root>" since scenes are now nodes
  self_moveNode(draft, id, parent_id ?? draft.scene_id!, order);

  return id;
}

function __self_delete_nodes<S extends editor.state.IEditorState>(
  draft: Draft<S>,
  target_node_ids: string[],
  scene_deletion_protection: "on" | "off" = "on"
) {
  // Filter out scene nodes if protection is enabled
  // Scenes should only be deleted via the "scenes/delete" action, not through regular node deletion
  let filtered_target_node_ids = target_node_ids;

  if (scene_deletion_protection === "on") {
    filtered_target_node_ids = target_node_ids.filter((node_id) => {
      // Filter out scene nodes - scenes should never be deletable via regular deletion
      return !draft.document.scenes_ref.includes(node_id);
    });
  }

  // If filtering removed all nodes, return early
  if (filtered_target_node_ids.length === 0) {
    return;
  }

  // Collect parent IDs before deletion
  const parent_ids_to_check = new Set<string>();
  for (const node_id of filtered_target_node_ids) {
    const parent_id = dq.getParentId(draft.document_ctx, node_id);
    if (parent_id) {
      parent_ids_to_check.add(parent_id);
    }
  }

  for (const node_id of filtered_target_node_ids) {
    if (
      // the deleting node cannot be.. in content edit mode
      node_id !== draft.content_edit_mode?.node_id
    ) {
      self_try_remove_node(draft, node_id);
    }
  }

  // Clean up empty boolean/group nodes after deletion
  __self_post_hierarchy_change_commit(draft, Array.from(parent_ids_to_check));
}

/**
 * Post-deletion cleanup function that removes empty boolean and group nodes.
 * Boolean and group nodes are not allowed to have no children in the editor.
 */
function __self_post_hierarchy_change_commit<
  S extends editor.state.IEditorState,
>(draft: Draft<S>, parent_ids_to_check: string[]) {
  const nodes_to_check = new Set<string>(parent_ids_to_check);

  // Check each parent node to see if it's now empty
  for (const parent_id of nodes_to_check) {
    const parent_node = dq.__getNodeById(draft, parent_id);
    if (!parent_node) continue;

    // Only check boolean and group nodes
    if (parent_node.type === "boolean" || parent_node.type === "group") {
      // Check if the node has children property and if it's empty
      const children_refs = draft.document.links[parent_id];

      if (children_refs?.length === 0) {
        // Remove the empty boolean/group node
        self_try_remove_node(draft, parent_id);

        // Recursively check the parent of this removed node
        const grandparent_id = dq.getParentId(draft.document_ctx, parent_id);
        if (grandparent_id) {
          nodes_to_check.add(grandparent_id);
        }
      }
    }
  }
}

function __self_delete_vector_network_selection(
  draft: Draft<editor.state.IEditorState>,
  ved: editor.state.VectorContentEditMode
) {
  assert(draft.content_edit_mode?.type === "vector");
  const {
    node_id,
    selection: { selected_vertices, selected_segments, selected_tangents },
  } = ved;

  const node = dq.__getNodeById(
    draft,
    node_id
  ) as grida.program.nodes.VectorNode;

  self_updateVectorNodeVectorNetwork(node, (vne) => {
    // delete tangents
    for (const [v_idx, t_idx] of selected_tangents) {
      const point = t_idx === 0 ? "a" : "b";
      const control = t_idx === 0 ? "ta" : "tb";
      for (const si of vne.findSegments(v_idx, point)) {
        vne.deleteTangent(si, control);
      }
    }

    // delete segments
    const segs = [...selected_segments].sort((a, b) => b - a);
    for (const si of segs) {
      vne.deleteSegment(si);
    }

    // delete vertices
    const verts = [...selected_vertices].sort((a, b) => b - a);
    for (const vi of verts) {
      vne.deleteVertex(vi);
    }
  });

  draft.content_edit_mode.selection = {
    selected_vertices: [],
    selected_segments: [],
    selected_tangents: [],
  };
  draft.content_edit_mode.selection_neighbouring_vertices = [];
  draft.content_edit_mode.a_point = null;
}

function __self_order(
  draft: Draft<editor.state.IEditorState>,
  node_id: string,
  order: "back" | "front" | "backward" | "forward" | number
) {
  assert(draft.scene_id, "scene_id is required for order");

  // Use Graph.order() - mutates draft.document directly (scene is now a node!)
  const graphData = new tree.graph.Graph(draft.document, EDITOR_GRAPH_POLICY);
  graphData.order(node_id, order);

  // Update context from graph's cached LUT
  draft.document_ctx = graphData.lut;
}
