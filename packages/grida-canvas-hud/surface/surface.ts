import { HUDCanvas } from "../primitives/canvas";
import type { HUDDraw } from "../primitives/types";
import type {
  SurfaceEvent,
  SurfaceResponse,
  Modifiers,
  PointerButton,
} from "../event/event";
import { SurfaceState } from "../event/state";
import type { SurfaceGesture, NodeId } from "../event/gesture";
import type { CursorIcon } from "../event/cursor";
import type { Intent, IntentHandler } from "../event/intent";
import type { Transform } from "../event/transform";
import type { SelectionShape, SelectionGroup } from "../event/shape";
import { type HUDStyle, DEFAULT_STYLE, mergeStyle } from "./style";
import { buildChrome, fanOverlays, mergeDraws } from "./chrome";

export interface SurfaceOptions {
  /**
   * Content pick. Given a doc-space point, return the topmost node id under
   * the pointer, or `null`. Host wraps its scene query however it wants
   * (e.g. `elementFromPoint` + `data-id` for SVG-DOM hosts).
   */
  pick: (point_doc: [number, number]) => NodeId | null;
  /**
   * Selection shape for a node — what the chrome should wrap. Most nodes
   * return `{ kind: "rect", rect }`; vector lines return
   * `{ kind: "line", p1, p2 }`.
   */
  shapeOf: (id: NodeId) => SelectionShape | null;
  /** Surface emits intents the host commits. */
  onIntent: IntentHandler;
  /** Initial style (partial; merged with defaults). */
  style?: Partial<HUDStyle>;
  /** Initial readonly flag. Default `false`. */
  readonly?: boolean;
  /** Optional HUDCanvas color override. */
  color?: string;
}

/**
 * Top-level wired surface.
 *
 * Owns an internal `HUDCanvas`, a `SurfaceState` (gesture/hover/...) and
 * the host providers. On every `dispatch`, the state machine runs;
 * `draw` composes surface chrome + host-fed extras into a single canvas
 * paint.
 */
export class Surface {
  private hudCanvas: HUDCanvas;
  private state: SurfaceState;
  private style: HUDStyle;
  private opts: SurfaceOptions;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement, options: SurfaceOptions) {
    this.opts = options;
    this.style = mergeStyle(DEFAULT_STYLE, options.style);
    this.hudCanvas = new HUDCanvas(canvas, {
      color: options.color ?? this.style.chromeColor,
    });
    this.state = new SurfaceState();
    if (options.readonly !== undefined) {
      this.state.setReadonly(options.readonly);
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.hudCanvas.setSize(w, h);
  }

  setTransform(t: Transform): void {
    this.state.setTransform(t);
    this.hudCanvas.setTransform(t);
  }

  /**
   * Push a new selection from the host.
   *
   * Accepts either:
   * - `NodeId[]` — each id becomes its own single-member group, shape
   *   resolved via `shapeOf(id)` by the chrome builder.
   * - `SelectionGroup[]` — pre-computed groups with their union shape.
   *
   * See `SurfaceState.setSelection` for details.
   */
  setSelection(input: readonly NodeId[] | readonly SelectionGroup[]): void {
    this.state.setSelection(input);
  }

  setStyle(partial: Partial<HUDStyle>): void {
    this.style = mergeStyle(this.style, partial);
    this.hudCanvas.setColor(this.style.chromeColor);
  }

  setReadonly(v: boolean): void {
    this.state.setReadonly(v);
  }

  /**
   * Set or clear a host-driven hover override.
   *
   * The surface tracks two hover sources:
   * - **Pointer pick** — what scene content is under the cursor (updated
   *   automatically on `pointer_move`).
   * - **Host override** — what the host wants to show as hovered, e.g.
   *   from a layers panel row mouseenter.
   *
   * The override (when non-null) wins. `hover()` returns the effective
   * value; chrome renders the effective value. Pass `null` to clear and
   * fall back to pointer pick.
   *
   * Returns the same response shape as `dispatch` so the host can react
   * to whether anything actually changed.
   */
  setHoverOverride(id: NodeId | null): SurfaceResponse {
    return this.state.setHoverOverride(id);
  }

  dispose(): void {
    // Currently no external resources; placeholder for future listeners.
  }

  // ── Input ────────────────────────────────────────────────────────────────

  dispatch(event: SurfaceEvent): SurfaceResponse {
    return this.state.dispatch(event, {
      pick: this.opts.pick,
      shapeOf: this.opts.shapeOf,
      emitIntent: this.opts.onIntent,
    });
  }

  // ── Frame ────────────────────────────────────────────────────────────────

  draw(extra?: HUDDraw): void {
    const { overlays, decoration } = buildChrome({
      state: this.state,
      shapeOf: this.opts.shapeOf,
      style: this.style,
      width: this.width,
      height: this.height,
    });
    const { screenRects } = fanOverlays(
      overlays,
      this.state.getTransform(),
      this.state.hitRegions()
    );
    this.hudCanvas.draw(mergeDraws(decoration, extra, screenRects));
  }

  /** Convenience: clear the canvas (e.g. when the host stops the surface). */
  clear(): void {
    this.hudCanvas.draw(undefined);
  }

  // ── Read-only introspection ─────────────────────────────────────────────

  gesture(): SurfaceGesture {
    return this.state.gesture;
  }

  /**
   * The effective hover: host override (when set) wins over pointer pick.
   * Use this for chrome decisions and host-side reads.
   */
  hover(): NodeId | null {
    return this.state.getEffectiveHover();
  }

  cursor(): CursorIcon {
    return this.state.cursor;
  }

  modifiers(): Modifiers {
    return this.state.modifiers;
  }
}

export type { SurfaceResponse, SurfaceEvent, PointerButton, Modifiers };
export type { Intent, IntentHandler };
export type { HUDStyle };
export type { SelectionShape, SelectionGroup };
