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
      kind: "cancel_gesture";
    };

/** Callback the host implements to receive intents. */
export type IntentHandler = (intent: Intent) => void;
