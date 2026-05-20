/**
 * LayoutEngine — host-implemented geometry oracle.
 *
 * Answers questions like "where is character `i` on screen?" and
 * "which character is at this point?". Every backend implements its
 * own — the package never measures glyphs itself.
 *
 * See README §"Why arrow-key semantics are the caller's problem" for
 * why this is the right seam.
 */
export interface LayoutEngine {
  /**
   * Map a screen-space point (e.g. `clientX/clientY` from a pointer
   * event) to a char index in `[0..text.length]`. Used by click-to-
   * position-caret and drag-to-extend-selection.
   */
  positionAtPoint(clientX: number, clientY: number): number;

  /**
   * Map a navigation direction to the next caret index. The host
   * decides semantics: "up" on a paragraph editor is the previous
   * visual line; on an SVG `<text>` it might be the previous tspan,
   * the start of the line, or a no-op.
   *
   * Returns the new caret index, or `null` if there's no valid
   * movement for this backend at this index (e.g. `move_up` on a
   * single-line text already at line start). Returning `null` makes
   * the orchestrator treat the command as a no-op.
   */
  positionForNavigation(
    index: number,
    direction: NavigationDirection
  ): number | null;
}

export type NavigationDirection =
  | "up"
  | "down"
  | "line_start"
  | "line_end"
  | "page_up"
  | "page_down";

/**
 * In-memory `LayoutEngine` for unit tests. Pretends every character is
 * a fixed-width box; `positionAtPoint` maps the x coord to the nearest
 * char index. Deterministic, no DOM needed.
 *
 * `positionForNavigation` returns `null` by default (no movement);
 * tests that exercise up/down navigation can subclass.
 */
export class MockLayoutEngine implements LayoutEngine {
  constructor(
    private readonly textProvider: () => string,
    private readonly charWidth = 10,
    private readonly originX = 0
  ) {}

  positionAtPoint(clientX: number, _clientY: number): number {
    const text = this.textProvider();
    if (!text) return 0;
    const local = clientX - this.originX;
    const idx = Math.round(local / this.charWidth);
    return Math.max(0, Math.min(text.length, idx));
  }

  positionForNavigation(
    _index: number,
    _direction: NavigationDirection
  ): number | null {
    return null;
  }
}
