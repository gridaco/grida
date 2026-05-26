// Vector-path — public input types.
//
// The host-pushed shape that drives the chrome. The chrome reads
// `vector_overlay` (geometry), `vector_selection` (sub-selection mirror),
// and `vector_hover` (HUD-owned hover state).

import type { HUDSemanticGroup } from "../../primitives/types";
import type { VectorHover, VectorSubSelection } from "../../event/state";
import type { OverlayElement } from "../../event/overlay";
import type { Transform } from "../../event/transform";
import type { HUDStyle } from "../../surface/style";

/**
 * Doc-space POJO returned by the host's `vectorOf` callback. The HUD never
 * imports `@grida/vn` — this minimal shape carries everything chrome needs.
 *
 * All coordinates are in doc-space (the HUD's container CSS-px frame). The
 * host is responsible for projecting from its local frame (e.g. SVG viewBox)
 * through the camera CTM before handing the data over.
 */
export interface VectorOverlay {
  /** Vertex positions in doc-space. Index === VertexId. */
  vertices: ReadonlyArray<readonly [number, number]>;
  /** Optional — present when the host wants segment chrome, tangent
   *  handles, and segment hit-strips. Each segment carries the four
   *  cubic control points in doc-space (already projected). */
  segments?: ReadonlyArray<{
    a: number;
    b: number;
    /** Absolute doc-space position of the first cubic control point
     *  (= vertices[a] + ta_local, projected through the host's CTM). */
    a_control: readonly [number, number];
    /** Absolute doc-space position of the second cubic control point
     *  (= vertices[b] + tb_local, projected). */
    b_control: readonly [number, number];
  }>;
  /** Vertices whose tangent handles should render. The host computes
   *  this — selected vertices ∪ their 1-hop neighbours (see
   *  `PathModel.neighbouringVertices`). Empty list = no tangent handles
   *  rendered. Spelled `neighbours` (not `neighbouring_vertices`) for
   *  brevity and so it doesn't collide with the main canvas editor's
   *  `selection_neighbouring_vertices` state field — if/when the main
   *  editor adopts this overlay shape, no field-name friction. */
  neighbours?: ReadonlyArray<number>;
  /**
   * Optional — closed-loop "regions" of the path. Each entry names the
   * segment indices forming one closed loop, in traversal order. The
   * loop must close (each segment's `b` must match the next segment's
   * `a`, and the last segment's `b` must match the first's `a`); the
   * HUD does not validate.
   *
   * Schema-level feature flag: absence of this field = backend doesn't
   * enumerate loops, no region chrome renders. Hosts that can derive
   * loops (e.g. via `vn.VectorNetworkEditor.getLoops()`) populate it
   * and pick up the chrome + intent + selection mirror for free.
   */
  regions?: ReadonlyArray<{
    segments: ReadonlyArray<number>;
  }>;
  /** Doc-space offset to add to local vertex coords before rendering.
   *  For hosts that already project to doc-space (most), pass `[0, 0]`. */
  origin?: readonly [number, number];
}

export interface VectorChromeInput {
  /** Sub-selection mirror pushed by the host via `setVectorSelection`.
   *  Same type the surface stores internally — chrome reads it each draw. */
  vector_selection: VectorSubSelection;
  vector_overlay: VectorOverlay;
  style: HUDStyle;
  /** Current vector hover (from `SurfaceState.getVectorHover()`). Drives
   *  hover affordance on segments, vertices, and tangent knobs. */
  vector_hover?: VectorHover | null;
  /** Current view transform. Used to compute screen-space cubic control
   *  points for the per-segment projection-based hit-test (so the
   *  threshold stays at the same screen-px regardless of zoom). Defaults
   *  to identity (1:1 doc-screen) when omitted — convenient for tests
   *  that don't exercise zoom-dependent behavior. */
  transform?: Transform;
  /**
   * True when the user is mid-interaction (pending pointer-down OR
   * non-idle gesture). When true, the chrome suppresses preview-only
   * affordances — overlays that exist to suggest "what idle hover would
   * do" and would compete with the user's actual intent. Currently
   * gates the ghost insertion knob; reused for any future hover-derived
   * preview overlay.
   *
   * Defaults to `false` so static chrome-render tests behave like idle.
   * In production, the surface threads `SurfaceState.isInteracting()`
   * here on every draw.
   */
  is_interacting?: boolean;
  group?: HUDSemanticGroup;
}

export interface VectorChromeOutput {
  overlays: OverlayElement[];
}
