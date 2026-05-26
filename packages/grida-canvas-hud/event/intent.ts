import type cmath from "@grida/cmath";
import type { ResizeDirection } from "./cursor";
import type { NodeId, Rect } from "./gesture";
import type { SelectionShape } from "./shape";

/** "preview" is emitted on every gesture move; "commit" once on release. */
export type IntentPhase = "preview" | "commit";

/**
 * Selection mode for `select` intents.
 *
 * - `replace` — clear selection, then select the given ids
 * - `add` — union into the current selection
 * - `toggle` — flip each given id's membership
 */
export type SelectMode = "replace" | "add" | "toggle";

/**
 * Actionable change emitted by the surface. The host commits the intent
 * (wrapping in `history.preview` for `phase: "preview"`, finalizing for
 * `phase: "commit"`).
 *
 * The surface itself never mutates the document.
 */
export type Intent =
  | {
      kind: "select";
      ids: NodeId[];
      mode: SelectMode;
    }
  | {
      kind: "deselect_all";
    }
  | {
      kind: "translate";
      ids: NodeId[];
      /** Total delta in document-space, from gesture start. */
      dx: number;
      dy: number;
      phase: IntentPhase;
    }
  | {
      kind: "resize";
      /** Member ids of the group being resized (1 or more). */
      ids: NodeId[];
      anchor: ResizeDirection;
      /**
       * Target rect in document-space. For `transformed` selections this
       * is the AABB of the new shape — preserved so axis-aligned hosts
       * that ignore `shape` keep working unchanged.
       */
      rect: Rect;
      /**
       * Full target shape. Present whenever the gesture produced one
       * (which is always, post-Commit 2 of the affine-first plan).
       * Hosts that handle rotated/sheared selections consume this
       * directly; legacy hosts can read `rect` and ignore `shape`.
       */
      shape?: SelectionShape;
      phase: IntentPhase;
    }
  | {
      kind: "rotate";
      /** Member ids of the group being rotated (typically 1). */
      ids: NodeId[];
      /** Target angle delta in radians (relative to gesture start). */
      angle: number;
      phase: IntentPhase;
    }
  | {
      kind: "marquee_select";
      /** Marquee rect in document-space (normalized). */
      rect: Rect;
      additive: boolean;
      phase: IntentPhase;
    }
  | {
      /**
       * Lasso (freeform polygon) selection. Symmetric to `marquee_select`
       * — emitted every pointer_move with `phase: "preview"` and on
       * pointer_up with `phase: "commit"`. The host runs its own hit-test;
       * for vector content-edit the predicate is
       * `cmath.polygon.pointInPolygon` against `polygon`.
       *
       * Per the main editor's decision (event-target.reducer.ts:629–641 +
       * vector.ts:163–291), lasso targets vertices and tangents only —
       * segments are NOT tested against the polygon. The host enforces
       * that constraint; the HUD just delivers the polygon.
       */
      kind: "lasso_select";
      /**
       * Doc-space polygon, oldest-first. Treated as closed
       * (`polygon[last] → polygon[0]` implicit).
       */
      polygon: cmath.Vector2[];
      additive: boolean;
      phase: IntentPhase;
    }
  | {
      kind: "set_endpoint";
      /** Subject node id (line-shape selection). */
      id: NodeId;
      /** Which endpoint is being moved. */
      endpoint: "p1" | "p2";
      /** Target position in document-space. */
      pos: cmath.Vector2;
      phase: IntentPhase;
    }
  | {
      kind: "enter_content_edit";
      id: NodeId;
    }
  | {
      /**
       * Exit content-edit mode. Fired by the HUD when the user dblclicks
       * "away" from the active edit (anywhere not on a vertex / tangent /
       * segment-strip overlay). No payload — the host knows which node
       * is under edit (it's the one it most recently pushed a vector
       * mirror for via `setVectorSelection`).
       *
       * Host policy: discard any in-flight preview, clear the vector
       * mirror (`setVectorSelection(null)`), return to whatever mode the
       * host considers "outside content-edit." The HUD doesn't presume
       * what that next mode is.
       */
      kind: "exit_content_edit";
    }
  | {
      /**
       * Select a single vertex within a path under content-edit. Mode
       * mirrors the node-level `select` intent. Hosts dispatch to their
       * path-edit session's sub-selection state.
       */
      kind: "select_vertex";
      /** Path node id under content-edit. */
      node_id: NodeId;
      /** Vertex index. */
      index: number;
      mode: SelectMode;
    }
  | {
      /**
       * Translate one or more vertices of a path under content-edit. The
       * delta is in document-space, measured from gesture start to the
       * current frame. Hosts apply the delta to each indexed vertex.
       */
      kind: "translate_vertices";
      /** Path node id under content-edit. */
      node_id: NodeId;
      /** Vertex indices to translate. */
      indices: number[];
      dx: number;
      dy: number;
      phase: IntentPhase;
    }
  | {
      /**
       * Translate the path-edit sub-selection. The host expands its
       * authoritative sub-selection (selected vertices ∪ endpoints of
       * selected segments) and UNIONs with `additional_vertex_indices`
       * before translating. Used by segment-body drag (default — Meta
       * switches to bend) so a drag of an unselected segment can still
       * translate its endpoints, and a drag of any item within a multi-
       * selection translates the whole selection coherently.
       */
      kind: "translate_vector_selection";
      node_id: NodeId;
      /** Vertex indices the host UNIONs with its sub-selection before
       *  translating. Carries the dragged segment's endpoints when the
       *  drag originated off-selection; empty otherwise. */
      additional_vertex_indices: readonly number[];
      dx: number;
      dy: number;
      phase: IntentPhase;
    }
  | {
      /**
       * Clear the path-edit sub-selection (vertices / segments / tangents)
       * WITHOUT exiting content-edit mode and WITHOUT touching the
       * host's node-level selection.
       *
       * Fires when the user single-clicks empty space while in content-
       * edit. Mirrors the dblclick `exit_content_edit` pattern — same
       * "click outside to back off" gesture, one fewer step. Without this
       * the user has no mouse way to drop a vertex sub-selection short of
       * leaving content-edit entirely.
       */
      kind: "clear_vector_selection";
    }
  | {
      /**
       * Select a single segment within a path under content-edit. Mode
       * mirrors the node-level `select` intent. Fires when the user clicks
       * a segment OFF the ghost insertion knob — clicking the ghost itself
       * fires `split_segment` instead.
       */
      kind: "select_segment";
      node_id: NodeId;
      segment: number;
      mode: SelectMode;
    }
  | {
      /**
       * Select a single tangent within a path under content-edit. Mode
       * mirrors the node-level `select` intent.
       */
      kind: "select_tangent";
      node_id: NodeId;
      /** `[vertex_idx, 0]` = ta on segment whose a===v; `[v, 1]` = tb where b===v. */
      tangent: readonly [number, 0 | 1];
      mode: SelectMode;
    }
  | {
      /**
       * Move a single tangent control point to a new doc-space position.
       * The host applies the mirror policy (`auto` infers from current
       * smooth-join state, `none` only moves the one tangent, `angle`
       * mirrors the opposite tangent's angle while preserving its length,
       * `all` mirrors both angle and length).
       */
      kind: "set_tangent";
      node_id: NodeId;
      tangent: readonly [number, 0 | 1];
      /** New doc-space position of the tangent's control point. */
      pos: cmath.Vector2;
      mirror: "auto" | "none" | "angle" | "all";
      phase: IntentPhase;
    }
  | {
      /**
       * Insert a new vertex on segment `segment` at parametric position
       * `t ∈ [0,1]`. The split halves inherit the original's verb if
       * possible; arc groups are broken. Fires once per click — no
       * preview phase (split is atomic).
       */
      kind: "split_segment";
      node_id: NodeId;
      segment: number;
      t: number;
    }
  | {
      /**
       * Bend segment `segment` by dragging a point originally at parameter
       * `ca` toward a doc-space target `cb`. The host re-solves the
       * segment's tangents to put `B(ca) === cb`, holding the endpoints
       * fixed. `phase` lets the host bracket a history preview the same
       * way translate does.
       */
      kind: "bend_segment";
      node_id: NodeId;
      segment: number;
      /** Frozen parametric position of the point being dragged. */
      ca: number;
      /** Target doc-space position the bent point should reach. */
      cb: cmath.Vector2;
      phase: IntentPhase;
    }
  | {
      /**
       * Drag of a corner-radius handle on `rect` geometry, default
       * branch (no alt). For the per-corner case (radii NOT all
       * equal) `anchor` is the corner the user grabbed; for the
       * center-handle case (radii all equal) `anchor` is RESOLVED
       * after the drag-threshold from the pull direction
       * (`corner → center` vector best matching the negated drag
       * delta).
       *
       * The host decides whether to apply the new `value` to all
       * four radii or only to the named `anchor`. The HUD doesn't
       * presume — it tells the host which corner the gesture
       * names, and the host's interaction model (e.g. "all-equal
       * stays all-equal during a center drag") picks the policy.
       * Hosts that want unambiguous single-corner semantics gate
       * on alt and read `corner_radius_explicit` instead.
       */
      kind: "corner_radius";
      node_id: NodeId;
      anchor: "nw" | "ne" | "se" | "sw";
      /** Target radius in doc-space units. */
      value: number;
      phase: IntentPhase;
    }
  | {
      /**
       * Same payload as `corner_radius`, but the user held alt
       * during the drag. Host MUST apply to the named `anchor`
       * only — never broadcast to other corners regardless of the
       * surrounding interaction model. Lets the user override an
       * all-equal default ("alt + drag a single corner makes it
       * different").
       *
       * Distinct kind, not a flag on `corner_radius`, so the host's
       * commit pipe doesn't have to branch on a hidden modifier
       * inside the payload — the modifier IS the intent.
       */
      kind: "corner_radius_explicit";
      node_id: NodeId;
      anchor: "nw" | "ne" | "se" | "sw";
      value: number;
      phase: IntentPhase;
    }
  | {
      /**
       * Drag of a corner-radius handle on `line` geometry. Lines
       * have a single `corner_radius` field on the node (not four
       * per-corner radii), so there is no anchor to resolve and no
       * alt branch — there's only one knob.
       *
       * Host applies the new `value` to the node's singular
       * `corner_radius` field.
       */
      kind: "corner_radius_uniform";
      node_id: NodeId;
      value: number;
      phase: IntentPhase;
    }
  | {
      /**
       * Drag of a parametric handle (the universal value-on-curve
       * affordance introduced by `surface.setParametricHandles`).
       * Hosts route to their reducer by `(node_id, handle_id)` and
       * decide policy from `modifiers` themselves — the producer
       * doesn't interpret `alt` / `shift` semantically.
       *
       * `value` is in host-units (whatever the host set on the
       * handle's `domain`), already snapped to `domain.step` if
       * configured.
       *
       * One intent kind for all consumers — corner-radius's
       * `corner_radius` / `corner_radius_explicit` / `corner_radius_uniform`
       * trio is a special case still emitted by `setCornerRadius`
       * for backward compatibility; new hosts standardize on this.
       */
      kind: "parametric_handle";
      node_id: NodeId;
      handle_id: string;
      value: number;
      modifiers: { alt: boolean; shift: boolean };
      phase: IntentPhase;
    }
  | {
      kind: "cancel_gesture";
    };

/** Callback the host implements to receive intents. */
export type IntentHandler = (intent: Intent) => void;
