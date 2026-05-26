import type cmath from "@grida/cmath";
import type { PaddingIntent } from "../classes/padding/intent";
import type { TransformBoxIntent } from "../classes/transform-box/intent";
import type { VectorPathIntent } from "../classes/vector-path/intent";
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
       * Lasso targets vertices and tangents only — segments are NOT tested
       * against the polygon. The host enforces that constraint; the HUD
       * just delivers the polygon.
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
  | VectorPathIntent
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
  | PaddingIntent
  | TransformBoxIntent
  | {
      kind: "cancel_gesture";
    };

/** Callback the host implements to receive intents. */
export type IntentHandler = (intent: Intent) => void;
