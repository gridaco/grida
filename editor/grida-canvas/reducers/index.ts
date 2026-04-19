import type { Action, EditorAction } from "../action";
import {
  enablePatches,
  produceWithPatches,
  type Draft,
  type Patch,
} from "immer";
import { safeOriginal, updateState } from "./utils/immer";
import {
  self_update_gesture_transform,
  self_updateSurfaceHoverState,
} from "./methods";
import { self_clearSelection } from "./methods/select";
import eventTargetReducer from "./event-target.reducer";
import documentReducer from "./document.reducer";
import grida from "@grida/schema";
import type vn from "@grida/vn";
import { editor } from "@/grida-canvas";
import { perf } from "../perf";
import {
  EFFECT_NONE,
  effectFromPatches,
  effectNodes,
  type Effect,
} from "../sync";

enablePatches();

export type ReducerContext = {
  idgen: grida.id.INodeIdGenerator<string>;
  geometry: editor.api.IDocumentGeometryQuery;
  vector?: editor.api.IDocumentVectorInterfaceActions | null;
  logger?: (...args: unknown[]) => void;
  viewport: {
    width: number;
    height: number;
  };
  backend: "dom" | "canvas";
  paint_constraints: editor.config.IEditorRenderingConfig["paint_constraints"];

  /**
   * Side-channel for gesture snapshots, kept outside Immer state.
   *
   * Gesture reducers store a deep clone of the document here at gesture start
   * and read it back on each frame. Because this lives outside the Immer draft
   * tree, Immer never proxies or finalizes the snapshot data — eliminating the
   * O(N) finalization overhead that previously dominated drag translate cost.
   *
   * @see editor.state.IMinimalDocumentState
   */
  gesture_snapshot: {
    get(): editor.state.IMinimalDocumentState | null;
    set(snapshot: editor.state.IMinimalDocumentState | null): void;
  };
};

/**
 * Reducer output tuple.
 *
 * The 4th slot (`Effect`) is the authoritative signal the WASM subscriber
 * uses to decide between full re-encode, per-node replace, or skip. It is
 * **not** derived from `patches` at the subscriber — the bypass path
 * produces no patches but still mutates nodes, so routing from patches
 * alone silently falls back to full sync and defeats the bypass. See
 * `../sync.ts` for the protocol.
 */
export type ReducerResult = [
  editor.state.IEditorState,
  Patch[],
  Patch[],
  Effect,
];

/**
 * Actions that enter the mutable-bypass branch. These are the gesture
 * hot-loop actions where Immer proxy/finalize overhead dominates — we
 * clone the specific state sub-objects they write to and run the recipe
 * directly on the clone. The bypass branch is also responsible for
 * producing an {@link Effect} that names the mutated nodes (since the
 * patches array it returns is always empty).
 */
const BYPASS_ACTION_TYPES: ReadonlySet<Action["type"]> = new Set<
  Action["type"]
>([
  "event-target/event/on-drag",
  "event-target/event/on-pointer-move",
  "event-target/event/on-pointer-move-raycast",
  "node/change/*",
]);

/** @internal Is this action eligible for the mutable bypass path? */
export function canBypassImmer(action: Action): boolean {
  return BYPASS_ACTION_TYPES.has(action.type);
}

/**
 * Compute the WASM-sync {@link Effect} for an action that took the
 * mutable-bypass path, by inspecting which node slots the bypass
 * cloned (and therefore may have mutated).
 *
 * Must stay aligned with the cloning strategy in the bypass branch —
 * every node slot we clone for mutation must appear in the effect.
 * The `scene_id` root is only reported for `guide` gestures (the only
 * gesture that actually writes to scene guides); all other clone-for-
 * safety cases on the scene root are no-ops on the wire since the
 * replacement bytes are identical.
 */
function effectForBypassAction(
  state: editor.state.IEditorState,
  action: Action
): Effect {
  // Hover/raycast actions never mutate document.nodes[*]; they update
  // pointer / hover / hit state only.
  if (
    action.type === "event-target/event/on-pointer-move" ||
    action.type === "event-target/event/on-pointer-move-raycast"
  ) {
    return EFFECT_NONE;
  }

  if (action.type === "node/change/*") {
    const nodeId = (action as { node_id: string }).node_id;
    if (typeof nodeId !== "string") return EFFECT_NONE;
    return effectNodes(new Set([nodeId]), new Set());
  }

  // event-target/event/on-drag — collect mutated node ids from gesture
  // and content-edit-mode state. Mirrors the bypass clone logic below.
  const replace = new Set<string>();
  const gesture = state.gesture;
  if (gesture.type !== "idle" && "selection" in gesture && gesture.selection) {
    for (const id of gesture.selection) replace.add(id);
  }
  if (gesture.type === "draw") replace.add(gesture.node_id);
  if (
    (gesture.type === "sort" || gesture.type === "gap") &&
    gesture.layout?.objects
  ) {
    for (const o of gesture.layout.objects) replace.add(o.id);
  }
  if (gesture.type === "brush") replace.add(gesture.node_id);
  if (gesture.type === "guide" && state.scene_id) {
    replace.add(state.scene_id);
  }
  const cem = state.content_edit_mode;
  if (cem) replace.add(cem.node_id);
  return effectNodes(replace, new Set());
}

/** Deep-clone a vector network so VectorNetworkEditor can mutate in-place. */
function cloneVectorNetwork(network: vn.VectorNetwork): vn.VectorNetwork {
  return {
    vertices: network.vertices.map(
      (v): vn.VectorNetworkVertex => [...v] as vn.VectorNetworkVertex
    ),
    segments: network.segments.map((s) => ({
      ...s,
      ta: [...s.ta] as [number, number],
      tb: [...s.tb] as [number, number],
    })),
  };
}

export default function reducer(
  state: editor.state.IEditorState,
  action: Action,
  context: ReducerContext,
  opts?: { skipPatches?: boolean }
): ReducerResult {
  if (
    state.debug &&
    !(
      action.type === "event-target/event/on-pointer-move" ||
      action.type === "event-target/event/on-pointer-move-raycast" ||
      action.type === "event-target/event/on-drag"
    )
  ) {
    context.logger?.("debug:action", action.type, action);
  }

  const __perf_end = perf.start("reducer.immer_produce", {
    action_type: action.type,
  });

  // When patches are not needed (recording: "silent"), use produce()
  // instead of produceWithPatches(). produce() still creates proxies but
  // skips the patch-generation bookkeeping.
  const recipe = (draft: Draft<editor.state.IEditorState>) => {
    switch (action.type) {
      case "__internal/webfonts#webfontList": {
        draft.webfontlist = action.webfontlist;
        return;
      }
      case "document/reset": {
        // Special marker action - already handled by reset() method
        // This should never actually reach the reducer, but handle it gracefully
        return;
      }
      case "load": {
        const { scene } = action;

        // Check if scene exists in scenes_ref
        if (!state.document.scenes_ref.includes(scene)) {
          return;
        }

        if (state.scene_id === scene) {
          return;
        }

        draft.scene_id = scene;
        Object.assign(draft, editor.state.__RESET_SCENE_STATE);
        return;
      }
      case "isolation": {
        const { node_id } = action;
        if (node_id !== null) {
          // Validate: node must exist in the document.
          const node = state.document.nodes[node_id];
          if (!node) return;
        }
        // When isolation root changes (e.g. switching focused slide),
        // clear the current selection so stale references don't persist.
        if (draft.isolation_root_node_id !== node_id) {
          self_clearSelection(draft);
        }
        draft.isolation_root_node_id = node_id;
        return;
      }
      case "transform": {
        const { transform, sync } = action;
        draft.transform = transform;
        if (sync) {
          self_updateSurfaceHoverState(draft);
        }
        return;
      }
      case "clip/color": {
        draft.user_clipboard_color = action.color;
        draft.brush_color = action.color;
        return;
      }
      default: {
        _reducer(draft as Draft<editor.state.IEditorState>, action, context);
      }
    }

    // ── editable guard: prevent document mutations in read-only mode ──
    // TODO: This is a band-aid. The proper fix is a system-level redesign
    // where the document model itself enforces immutability (e.g. a
    // read-only proxy/wrapper around `document` that throws on write when
    // `editable: false`), so sub-reducers never attempt mutations in the
    // first place. Currently, all reducers run freely and we revert the
    // document fields after the fact.
    if (!draft.editable) {
      const orig = safeOriginal(draft)!;
      draft.document.nodes = orig.document.nodes as Draft<
        typeof orig.document.nodes
      >;
      draft.document.links = orig.document.links as Draft<
        typeof orig.document.links
      >;
      draft.document.scenes_ref = orig.document.scenes_ref as Draft<
        typeof orig.document.scenes_ref
      >;
      draft.document.properties = orig.document.properties as Draft<
        typeof orig.document.properties
      >;
      draft.document.bitmaps = orig.document.bitmaps as Draft<
        typeof orig.document.bitmaps
      >;
    }
  };

  let nextState: editor.state.IEditorState;
  let patches: Patch[];
  let inversePatches: Patch[];

  if (opts?.skipPatches) {
    // ── Mutable bypass: skip Immer entirely ──
    // Create a mutable clone of the state. The recipe runs on this clone
    // directly — no proxies, no finalization. The clone IS the next state.
    //
    // Strategy: deep-clone everything EXCEPT `document.nodes` and
    // `document.links` (which are large). For those, use shallow spread
    // + targeted cloning of entries that will be mutated.
    //
    // structuredClone on the non-document parts is ~0.2ms (small objects).
    // Spreading `nodes` (1K entries) and `links` (1K entries) is <0.01ms.
    // Avoid spreading the entire nodes/links dicts (O(N) at 136K nodes).
    // Instead, check if they're frozen. If already mutable (from a prior
    // bypass dispatch), reuse them directly — only clone individual entries
    // that will be written to.
    const nodesFrozen = Object.isFrozen(state.document.nodes);
    const mutableNodes = nodesFrozen
      ? { ...state.document.nodes }
      : state.document.nodes;

    // Clone each node that's in the current selection so writes to
    // layout_inset_left/top don't mutate the frozen original node.
    const gesture = state.gesture;
    if (
      gesture.type !== "idle" &&
      "selection" in gesture &&
      gesture.selection
    ) {
      for (const id of gesture.selection) {
        if (mutableNodes[id]) {
          mutableNodes[id] = { ...mutableNodes[id] };
        }
      }
    }

    // Clone the content-edit-mode target node so writes to
    // layout_inset_left/top and internal data don't mutate the frozen
    // original during drag gestures.
    const cem = state.content_edit_mode;
    if (cem && mutableNodes[cem.node_id]) {
      const vid = cem.node_id;
      if (cem.type === "vector") {
        // VectorNetworkEditor mutates segments in-place (e.g. updateTangent
        // writes seg.ta/seg.tb), so deep-clone vector_network too.
        const vnode = mutableNodes[vid] as grida.program.nodes.VectorNode;
        mutableNodes[vid] = {
          ...vnode,
          vector_network: vnode.vector_network
            ? cloneVectorNetwork(vnode.vector_network)
            : vnode.vector_network,
        };
      } else {
        // width (stroke_width_profile), bitmap (layout props), etc.
        mutableNodes[vid] = { ...mutableNodes[vid] };
      }
    }

    // Clone the draw gesture's target node (line/pencil/arrow).
    // GestureDraw uses gesture.node_id, not gesture.selection.
    if (gesture.type === "draw" && mutableNodes[gesture.node_id]) {
      const dnode = mutableNodes[
        gesture.node_id
      ] as grida.program.nodes.VectorNode;
      mutableNodes[gesture.node_id] = {
        ...dnode,
        vector_network: dnode.vector_network
          ? cloneVectorNetwork(dnode.vector_network)
          : dnode.vector_network,
      };
    }

    // Clone all nodes in the sort/gap gesture's layout — the sort gesture
    // rewrites layout_inset_left/top on every sibling (transform.ts:543-551),
    // and the gap gesture does the same (event-target.reducer.ts:937-943).
    if (
      (gesture.type === "sort" || gesture.type === "gap") &&
      gesture.layout?.objects
    ) {
      for (const obj of gesture.layout.objects) {
        if (mutableNodes[obj.id]) {
          mutableNodes[obj.id] = { ...mutableNodes[obj.id] };
        }
      }
    }

    // Clone the brush gesture's target node.
    if (gesture.type === "brush" && mutableNodes[gesture.node_id]) {
      mutableNodes[gesture.node_id] = { ...mutableNodes[gesture.node_id] };
    }

    // Also clone the scene node for guide gesture (writes to guides[i].offset)
    if (state.scene_id && mutableNodes[state.scene_id]) {
      const snode = mutableNodes[
        state.scene_id
      ] as grida.program.nodes.SceneNode;
      mutableNodes[state.scene_id] = {
        ...snode,
        guides: snode.guides ? snode.guides.map((g) => ({ ...g })) : [],
      };
    }

    // Same strategy for links — skip the O(N) clone when already mutable.
    const linksFrozen = Object.isFrozen(state.document.links);
    let mutableLinks: Record<string, string[]>;
    if (linksFrozen) {
      mutableLinks = {};
      for (const key in state.document.links) {
        const arr = state.document.links[key];
        mutableLinks[key] = arr ? [...arr] : [];
      }
    } else {
      mutableLinks = state.document.links as Record<string, string[]>;
    }

    // Build the gesture clone. Sort/gap write to gesture.layout.objects,
    // so deep-clone layout when present.
    let mutableGesture: editor.gesture.GestureState;
    if (gesture.type === "sort" || gesture.type === "gap") {
      mutableGesture = {
        ...gesture,
        layout: {
          ...gesture.layout,
          objects: gesture.layout.objects.map((o) => ({ ...o })),
        },
      };
    } else {
      mutableGesture = { ...gesture };
    }

    // Build the content_edit_mode clone.
    let mutableCem = cem ? { ...cem } : cem;
    if (mutableCem?.type === "vector") {
      mutableCem = {
        ...mutableCem,
        selection: { ...mutableCem.selection },
        selection_neighbouring_vertices: [
          ...mutableCem.selection_neighbouring_vertices,
        ],
      };
    } else if (mutableCem?.type === "width") {
      mutableCem = {
        ...mutableCem,
        variable_width_profile: {
          ...mutableCem.variable_width_profile,
          stops: mutableCem.variable_width_profile.stops.map((s) => ({ ...s })),
        },
      };
    }

    const mutable = {
      ...state,
      document: {
        ...state.document,
        nodes: mutableNodes,
        links: mutableLinks,
        // Brush gesture writes to document.bitmaps[imageRef]; clone when
        // in bitmap content-edit mode so the dict is mutable.
        ...(cem?.type === "bitmap"
          ? { bitmaps: { ...state.document.bitmaps } }
          : {}),
      },
      document_ctx: { ...state.document_ctx },
      gesture: mutableGesture,
      // marquee: { a, b, additive } — .b is written during marquee drag
      marquee: state.marquee ? { ...state.marquee } : state.marquee,
      // lasso: { points, additive } — .points is pushed to during lasso drag
      lasso: state.lasso
        ? { ...state.lasso, points: [...state.lasso.points] }
        : state.lasso,
      content_edit_mode: mutableCem,
      // pointer: read-only during on-drag but clone for safety
      pointer: { ...state.pointer },
      // hits: read (slice) during translate hierarchy check
      hits: state.hits ? [...state.hits] : [],
      // Stash the original frozen state so code that uses safeOriginal()
      // can fall back to it when running outside Immer.
      __original: state,
    };

    // Run the recipe on the mutable object (cast as Draft for type compat)
    recipe(mutable as unknown as Draft<editor.state.IEditorState>);

    // Remove the stashed original before exposing as the new state
    delete (mutable as { __original?: unknown }).__original;

    nextState = mutable as unknown as editor.state.IEditorState;
    patches = [];
    inversePatches = [];
  } else {
    [nextState, patches, inversePatches] = produceWithPatches(state, recipe);
  }
  __perf_end();

  const effect: Effect = opts?.skipPatches
    ? effectForBypassAction(state, action)
    : effectFromPatches(patches);

  return [nextState, patches, inversePatches, effect];
}

function _reducer<S extends editor.state.IEditorState>(
  state: S,
  action: EditorAction,
  context: ReducerContext
): S {
  switch (action.type) {
    case "config/surface/raycast-targeting": {
      const { config } = action;
      return updateState(state, (draft: Draft<S>) => {
        if (config.target)
          draft.pointer_hit_testing_config.target = config.target;
        if (config.ignores_locked)
          draft.pointer_hit_testing_config.ignores_locked =
            config.ignores_locked;
        // ignores_root_with_children removed - now using scene-based logic (single mode vs normal mode)
        self_updateSurfaceHoverState(draft);
      });
    }
    case "config/surface/measurement": {
      const { measurement } = action;
      return updateState(state, (draft: Draft<S>) => {
        switch (measurement) {
          case "on": {
            draft.surface_measurement_targeting = "on";
            self_updateSurfaceHoverState(draft);
            break;
          }
          case "off": {
            draft.surface_measurement_targeting = "off";
            draft.surface_measurement_target = undefined;
            self_updateSurfaceHoverState(draft);
            break;
          }
        }
      });
      break;
    }
    case "config/modifiers/translate-with-clone": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_clone =
          action.translate_with_clone;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-axis-lock": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.tarnslate_with_axis_lock =
          action.tarnslate_with_axis_lock;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/translate-with-force-disable-snap": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.translate_with_force_disable_snap =
          action.translate_with_force_disable_snap;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/scale-with-force-disable-snap": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.scale_with_force_disable_snap =
          action.scale_with_force_disable_snap;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-center-origin": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_center_origin =
          action.transform_with_center_origin;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/transform-with-preserve-aspect-ratio": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.transform_with_preserve_aspect_ratio =
          action.transform_with_preserve_aspect_ratio;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/rotate-with-quantize": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.rotate_with_quantize =
          action.rotate_with_quantize;
        self_update_gesture_transform(draft, context);
      });
    }
    case "config/modifiers/curve-tangent-mirroring": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.curve_tangent_mirroring =
          action.curve_tangent_mirroring;
      });
    }
    case "config/modifiers/padding-with-mirroring": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.padding_with_axis_mirroring =
          action.padding_with_axis_mirroring;
      });
    }
    case "config/modifiers/path-keep-projecting": {
      return updateState(state, (draft: Draft<S>) => {
        draft.gesture_modifiers.path_keep_projecting =
          action.path_keep_projecting;
      });
    }
    case "gesture/nudge": {
      return updateState(state, (draft: Draft<S>) => {
        const { state } = action;
        switch (state) {
          case "on": {
            draft.gesture = { type: "nudge" };
            break;
          }
          case "off": {
            draft.gesture = { type: "idle" };
            break;
          }
        }
      });
    }
    case "event-target/event/multiple-selection-overlay/on-click":
    case "event-target/event/on-click":
    case "event-target/event/on-double-click":
    case "event-target/event/on-drag":
    case "event-target/event/on-drag-end":
    case "event-target/event/on-drag-start":
    case "event-target/event/on-pointer-down":
    case "event-target/event/on-pointer-move":
    case "event-target/event/on-pointer-move-raycast":
    case "event-target/event/on-pointer-up": {
      return eventTargetReducer(state, action, context);
    }
    default:
      return documentReducer(state, action, context);
  }
}
