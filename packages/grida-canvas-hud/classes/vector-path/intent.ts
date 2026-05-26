// Vector-path — intent variants.
//
// 10 variants total, all `phase: "preview" | "commit"` where applicable.
// `enter_content_edit` / `exit_content_edit` stay in `event/intent.ts`
// — they're orchestration (mode entry/exit), not vector-class-bound.

import type cmath from "@grida/cmath";
import type { NodeId } from "../../event/gesture";
import type { IntentPhase, SelectMode } from "../../event/intent";

export type VectorPathIntent =
  | {
      /**
       * Select a single vertex within a path under content-edit. Mode
       * mirrors the node-level `select` intent. Hosts dispatch to their
       * path-edit session's sub-selection state.
       */
      kind: "select_vertex";
      node_id: NodeId;
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
      node_id: NodeId;
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
       * Select a single closed-loop "region" within a path under
       * content-edit. Fires when the user clicks the interior body of
       * a closed loop (no vertex / tangent / segment-strip control
       * intercepted the click). Mode mirrors the node-level `select`
       * intent.
       *
       * Subsequent drag (if any) promotes to `translate_vector_selection`
       * — the host applies the delta to the loop's segments and their
       * endpoint vertices, the same way segment-body drag works today.
       * No new translate intent kind.
       *
       * The host's region commit policy is its own choice: typical
       * hosts also push the loop's segment indices into
       * `VectorSubSelection.segments` (so segment chrome highlights too)
       * and the picked region's id into `VectorSubSelection.regions`
       * (so the region's `selected` paint shows). The HUD doesn't
       * presume — it only reports "the user clicked region N."
       */
      kind: "select_region";
      node_id: NodeId;
      region: number;
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
      ca: number;
      cb: cmath.Vector2;
      phase: IntentPhase;
    };
