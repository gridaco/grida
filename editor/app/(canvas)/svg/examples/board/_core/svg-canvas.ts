// SvgCanvas — the headless core of the infinite-canvas-of-SVGs spike.
//
// SPIKE / THROWAWAY. Not shipped. See plan: docs reference issue #886, the
// `.canvas` canvas-view projection. This class is the *host* that composes
// many standalone SVG documents onto one pan/zoom plane — the layer that lives
// ABOVE @grida/svg-editor (which stays a single-document editor).
//
// Doctrine match: all load-bearing logic lives here (a plain class, no React,
// no `window`/`document`). The React layer is a thin useSyncExternalStore wire.
//
// Camera model: a host infinite canvas only needs pan + uniform zoom, so the
// camera is `{ x, y, zoom }` (NOT a full affine). screen = world*zoom + (x,y).
// This is deliberately the host's OWN minimal camera, not @grida/svg-editor's
// surface-scoped `Camera` — discovering whether the two should share a class is
// one of the spike's findings.

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

import {
  parseSvgElements,
  elementAtPoint,
  applyElementTranslate,
  type SvgGeometry,
} from "./svg-geometry";

/** A reference to one element inside one frame (cross-frame element selection). */
export type ElementRef = { frameId: string; key: number };

/** Pan + uniform zoom. `screen = world * zoom + (x, y)`. */
export type Camera = { x: number; y: number; zoom: number };

/** One placed SVG document on the canvas (the canvas-view of a `.canvas` doc). */
export type Frame = {
  /** Resolved identity (`ResolvedDocument.id`). */
  id: string;
  /** Authored path, e.g. `001.svg` — for debugging / serialize-back later. */
  src: string;
  /** The standalone SVG markup (sovereign — one document, isolated). */
  svg: string;
  /** `data:image/svg+xml,…` form, precomputed for the inert <img> render. */
  dataUri: string;
  /** World-space placement (from `ResolvedDocument.layout`). */
  rect: Rect;
  /** Paint order; higher paints on top. From `layout.z` (default 0). */
  z: number;
  /** Parsed element geometry (viewBox space) for host-side cross-frame picking
   *  — the host's own toy engine, since an `<img>` has no queryable DOM. */
  geom: SvgGeometry;
};

export type SvgCanvasState = {
  readonly frames: readonly Frame[];
  readonly camera: Camera;
  readonly selection: readonly string[];
  /** The frame currently open for content editing (a live svg-editor), or null. */
  readonly activeId: string | null;
  /** Cross-frame element selection (feature rung D) — elements from possibly
   *  DIFFERENT frames, selected together and dragged as one. */
  readonly elementSelection: readonly ElementRef[];
  /** Live world-space delta while dragging the element selection (ghost), or
   *  null. Kept transient so a per-move drag doesn't re-encode SVGs. */
  readonly elementDrag: Point | null;
  /** Live marquee rectangle in SCREEN space (for the chrome overlay), or null. */
  readonly marquee: Rect | null;
  /** Host-level (canvas) undo/redo availability — see the History section. */
  readonly canUndo: boolean;
  readonly canRedo: boolean;
};

/**
 * A history snapshot. Because every mutation REPLACES frame objects (never
 * mutates in place), a snapshot is just a reference to the immutable arrays —
 * O(1) to capture, no cloning. This is the unified canvas history: frame
 * placement AND frame content (each frame's svg) live here, so a move and an
 * edit-session sit on the SAME timeline.
 */
type Snapshot = {
  readonly frames: readonly Frame[];
  readonly selection: readonly string[];
};

/**
 * The active editor's history, as a minimal port (no `SvgEditor` coupling, so
 * the core stays dependency-free). The host registers this on `activate` so
 * `undo`/`redo` can walk the open document's FINE history before crossing the
 * frame boundary into the canvas history.
 */
export type ActiveHistoryPort = {
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
};

// match @grida/svg-editor's camera clamps (defaults.ts MIN_ZOOM/MAX_ZOOM)
const ZOOM_MIN = 0.02;
const ZOOM_MAX = 256;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function rectContains(r: Rect, p: Point): boolean {
  return (
    p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
  );
}

function rectIntersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/** Build a world-space Rect from two screen points + a camera (for marquee). */
function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Axis-aligned union of rects (same space), or null when empty. */
function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export type FrameInput = Omit<Frame, "dataUri" | "z" | "geom"> & { z?: number };

export class SvgCanvas {
  private _state: SvgCanvasState;
  private _subscribers = new Set<() => void>();
  // unified canvas history (the top of `_undo` is always the current state)
  private _undo: Snapshot[] = [];
  private _redo: Snapshot[] = [];
  // the open editor's fine history (when a frame is active), + a one-shot flag
  // to DROP a session's write-back when we undo our way OUT of the frame
  private _activeHistory: ActiveHistoryPort | null = null;
  private _discardNextEdit = false;

  constructor(input: { frames: readonly FrameInput[]; camera?: Camera }) {
    const frames: Frame[] = input.frames.map((f) => ({
      ...f,
      z: f.z ?? 0,
      dataUri: svgToDataUri(f.svg),
      geom: parseSvgElements(f.svg),
    }));
    this._state = {
      frames,
      camera: input.camera ?? { x: 0, y: 0, zoom: 1 },
      selection: [],
      activeId: null,
      elementSelection: [],
      elementDrag: null,
      marquee: null,
      canUndo: false,
      canRedo: false,
    };
    this._undo = [this.currentSnapshot()];
  }

  // ── store ────────────────────────────────────────────────────────────────

  getState = (): SvgCanvasState => this._state;

  subscribe = (cb: () => void): (() => void) => {
    this._subscribers.add(cb);
    return () => this._subscribers.delete(cb);
  };

  private commit(next: Partial<SvgCanvasState>) {
    this._state = { ...this._state, ...next };
    this._subscribers.forEach((cb) => cb());
  }

  // ── camera / projection ────────────────────────────────────────────────────

  screenToWorld(sx: number, sy: number): Point {
    const { x, y, zoom } = this._state.camera;
    return { x: (sx - x) / zoom, y: (sy - y) / zoom };
  }

  worldToScreen(wx: number, wy: number): Point {
    const { x, y, zoom } = this._state.camera;
    return { x: wx * zoom + x, y: wy * zoom + y };
  }

  /** Project a world Rect to a screen Rect (for chrome at identity). */
  worldRectToScreen(r: Rect): Rect {
    const tl = this.worldToScreen(r.x, r.y);
    const { zoom } = this._state.camera;
    return { x: tl.x, y: tl.y, width: r.width * zoom, height: r.height * zoom };
  }

  /** World units per local (viewBox) unit for a frame — its placement scale. */
  private scaleOf(f: Frame): { sx: number; sy: number } {
    const vb = f.geom.viewBox;
    return {
      sx: vb.width > 0 ? f.rect.width / vb.width : 1,
      sy: vb.height > 0 ? f.rect.height / vb.height : 1,
    };
  }

  /** A world point → the frame's own (viewBox) coordinate space. */
  worldToFrameLocal(f: Frame, w: Point): Point {
    const s = this.scaleOf(f);
    return { x: (w.x - f.rect.x) / s.sx, y: (w.y - f.rect.y) / s.sy };
  }

  /** A frame-local (viewBox) Rect → world space (for chrome). */
  frameLocalRectToWorld(f: Frame, r: Rect): Rect {
    const s = this.scaleOf(f);
    return {
      x: f.rect.x + r.x * s.sx,
      y: f.rect.y + r.y * s.sy,
      width: r.width * s.sx,
      height: r.height * s.sy,
    };
  }

  panBy(dxScreen: number, dyScreen: number) {
    const c = this._state.camera;
    this.commit({ camera: { ...c, x: c.x + dxScreen, y: c.y + dyScreen } });
  }

  /** Multiply zoom by `factor`, keeping the world point under (sx, sy) fixed. */
  zoomAt(factor: number, sx: number, sy: number) {
    const c = this._state.camera;
    const world = this.screenToWorld(sx, sy);
    const zoom = clamp(c.zoom * factor, ZOOM_MIN, ZOOM_MAX);
    this.commit({
      camera: { zoom, x: sx - world.x * zoom, y: sy - world.y * zoom },
    });
  }

  /** Center + fit all frames into a viewport of the given screen size. */
  fit(viewportW: number, viewportH: number, padding = 64) {
    const b = this.contentBounds();
    if (!b || viewportW <= 0 || viewportH <= 0) return;
    const zoom = clamp(
      Math.min(
        (viewportW - padding * 2) / b.width,
        (viewportH - padding * 2) / b.height
      ),
      ZOOM_MIN,
      ZOOM_MAX
    );
    const x = (viewportW - b.width * zoom) / 2 - b.x * zoom;
    const y = (viewportH - b.height * zoom) / 2 - b.y * zoom;
    this.commit({ camera: { x, y, zoom } });
  }

  /** Union of all frame rects in world space, or null when empty. */
  contentBounds(): Rect | null {
    return unionRects(this._state.frames.map((f) => f.rect));
  }

  // ── frame queries ──────────────────────────────────────────────────────────

  /** Topmost frame whose world rect contains the screen point, or null.
   *  Topmost = highest `z`, ties broken by later paint (array) order. */
  frameAtScreen(sx: number, sy: number): Frame | null {
    const p = this.screenToWorld(sx, sy);
    let hit: Frame | null = null;
    let hitZ = -Infinity;
    for (const f of this._state.frames) {
      if (f.z >= hitZ && rectContains(f.rect, p)) {
        hit = f;
        hitZ = f.z;
      }
    }
    return hit;
  }

  // ── selection ──────────────────────────────────────────────────────────────

  /** Select the topmost frame at a screen point. `additive` toggles into the set. */
  selectAtScreen(sx: number, sy: number, opts?: { additive?: boolean }) {
    const hit = this.frameAtScreen(sx, sy);
    if (!hit) {
      if (!opts?.additive) this.commit({ selection: [], elementSelection: [] });
      return;
    }
    if (opts?.additive) {
      const set = new Set(this._state.selection);
      if (set.has(hit.id)) set.delete(hit.id);
      else set.add(hit.id);
      this.commit({ selection: [...set], elementSelection: [] });
    } else {
      this.commit({ selection: [hit.id], elementSelection: [] });
    }
  }

  clearSelection() {
    if (this._state.selection.length || this._state.elementSelection.length) {
      this.commit({ selection: [], elementSelection: [] });
    }
  }

  // ── marquee ──────────────────────────────────────────────────────────────────

  /** Update the live marquee from two screen points; also live-selects frames. */
  updateMarquee(
    aScreen: Point,
    bScreen: Point,
    baseline: readonly string[],
    opts?: { additive?: boolean }
  ) {
    const screenRect = normalizeRect(aScreen, bScreen);
    const worldRect = normalizeRect(
      this.screenToWorld(screenRect.x, screenRect.y),
      this.screenToWorld(
        screenRect.x + screenRect.width,
        screenRect.y + screenRect.height
      )
    );
    const hits = this._state.frames
      .filter((f) => rectIntersects(f.rect, worldRect))
      .map((f) => f.id);
    const selection = opts?.additive
      ? [...new Set([...baseline, ...hits])]
      : hits;
    this.commit({ marquee: screenRect, selection, elementSelection: [] });
  }

  endMarquee() {
    if (this._state.marquee) this.commit({ marquee: null });
  }

  // ── cross-frame element selection + drag (feature rung D) ─────────────────────
  //
  // The make-or-break probe: select elements that live in DIFFERENT single-doc
  // frames and drag them together. The editor's own picking is surface-private
  // and its HUD clips at the frame edge, so the host synthesizes BOTH here —
  // picking via its toy geometry engine, chrome via a host overlay that spans
  // frames (see the view). One unified-history step on drop.

  /** Topmost element under a screen point, across whichever frame is on top. */
  elementAtScreen(sx: number, sy: number): ElementRef | null {
    const frame = this.frameAtScreen(sx, sy);
    if (!frame) return null;
    const local = this.worldToFrameLocal(frame, this.screenToWorld(sx, sy));
    const el = elementAtPoint(frame.geom, local);
    return el ? { frameId: frame.id, key: el.key } : null;
  }

  private hasElement(ref: ElementRef): boolean {
    return this._state.elementSelection.some(
      (r) => r.frameId === ref.frameId && r.key === ref.key
    );
  }

  /** Add an element to the cross-frame selection (idempotent). Entering element
   *  mode drops any FRAME selection — the two never drag at once. */
  pickElement(ref: ElementRef) {
    if (this.hasElement(ref)) {
      if (this._state.selection.length) this.commit({ selection: [] });
      return;
    }
    this.commit({
      elementSelection: [...this._state.elementSelection, ref],
      selection: [],
    });
  }

  /** Remove an element from the selection (deselect-on-click). */
  unpickElement(ref: ElementRef) {
    if (!this.hasElement(ref)) return;
    this.commit({
      elementSelection: this._state.elementSelection.filter(
        (r) => !(r.frameId === ref.frameId && r.key === ref.key)
      ),
    });
  }

  clearElementSelection() {
    if (this._state.elementSelection.length || this._state.elementDrag) {
      this.commit({ elementSelection: [], elementDrag: null });
    }
  }

  /** Resolve the element selection to world-space rects (for host chrome). */
  elementSelectionWorldRects(): { ref: ElementRef; rect: Rect }[] {
    const out: { ref: ElementRef; rect: Rect }[] = [];
    for (const ref of this._state.elementSelection) {
      const f = this._state.frames.find((x) => x.id === ref.frameId);
      const el = f?.geom.elements.find((e) => e.key === ref.key);
      if (f && el)
        out.push({ ref, rect: this.frameLocalRectToWorld(f, el.bbox) });
    }
    return out;
  }

  /** World-space union of the element selection (the cross-frame bounds box).
   *  Accepts already-resolved rects (from `elementSelectionWorldRects`) so a
   *  caller that already holds them doesn't resolve twice; omit to resolve here. */
  elementSelectionBounds(
    rects: { ref: ElementRef; rect: Rect }[] = this.elementSelectionWorldRects()
  ): Rect | null {
    return unionRects(rects.map((r) => r.rect));
  }

  /** Set the transient drag delta (world space) — ghost only, no SVG re-encode. */
  setElementDrag(dxWorld: number, dyWorld: number) {
    this.commit({ elementDrag: { x: dxWorld, y: dyWorld } });
  }

  /**
   * Commit the element drag: rewrite each affected frame's SVG (translate the
   * selected element(s) in that frame's local space) and record ONE history
   * step. No-op (no step) when the drag is zero. This is where the cross-frame
   * move actually lands — each element moves within ITS OWN sovereign document.
   */
  commitElementDrag() {
    const d = this._state.elementDrag;
    this.commit({ elementDrag: null });
    if (!d || (d.x === 0 && d.y === 0)) return;

    const byFrame = new Map<string, number[]>();
    for (const ref of this._state.elementSelection) {
      const keys = byFrame.get(ref.frameId) ?? [];
      keys.push(ref.key);
      byFrame.set(ref.frameId, keys);
    }
    if (byFrame.size === 0) return;

    const frames = this._state.frames.map((f) => {
      const keys = byFrame.get(f.id);
      if (!keys) return f;
      const s = this.scaleOf(f);
      let svg = f.svg;
      for (const k of keys) {
        svg = applyElementTranslate(svg, k, d.x / s.sx, d.y / s.sy);
      }
      return {
        ...f,
        svg,
        dataUri: svgToDataUri(svg),
        geom: parseSvgElements(svg),
      };
    });
    this.commit({ frames });
    this.pushHistory();
  }

  // ── active frame / content edit (feature rung C) ─────────────────────────────

  /** Open a frame for content editing (mounts a live svg-editor). Also selects it. */
  activate(id: string) {
    if (this._state.activeId === id) return;
    this.commit({
      activeId: id,
      selection: [id],
      elementSelection: [],
      marquee: null,
    });
  }

  /** Close the active frame. The write-back happens in the React unmount path —
   *  unless `discard` (we're undoing OUT of the frame, so drop the session). */
  deactivate(opts?: { discard?: boolean }) {
    if (this._state.activeId === null) return;
    if (opts?.discard) this._discardNextEdit = true;
    this.commit({ activeId: null });
  }

  /** Register / clear the open editor's history port (host wires it on attach). */
  setActiveHistory(port: ActiveHistoryPort | null) {
    this._activeHistory = port;
  }

  /** Replace a frame's SVG (data URI + parsed geometry) — used to write edits back. */
  updateFrameSvg(id: string, svg: string) {
    const frames = this._state.frames.map((f) =>
      f.id === id
        ? { ...f, svg, dataUri: svgToDataUri(svg), geom: parseSvgElements(svg) }
        : f
    );
    this.commit({ frames });
  }

  /**
   * Write an edit session's result back AND record it as ONE history step.
   * No-op (no history) when the SVG is byte-equal — the editor's round-trip
   * guarantee means "opened, didn't edit, closed" produces no spurious step.
   */
  commitFrameEdit(id: string, svg: string) {
    if (this._discardNextEdit) {
      this._discardNextEdit = false; // undid out of the frame — drop the session
      return;
    }
    const prev = this._state.frames.find((f) => f.id === id);
    if (!prev || prev.svg === svg) return;
    this.updateFrameSvg(id, svg);
    this.pushHistory();
  }

  // ── unified history (the spike's load-bearing component) ──────────────────────
  //
  // ONE timeline across canvas-level ops (frame move) and per-frame edit
  // SESSIONS. Granularity is intentional: while a frame is open, the live
  // svg-editor owns FINE-grained undo (Cmd+Z inside it); on close the net edit
  // folds into a single host step here. Fine-grained undo ACROSS documents from
  // this stack is out of scope — that's the single-document boundary, not a bug.

  private currentSnapshot(): Snapshot {
    // frames/selection are immutable (every op replaces them) → reference is a
    // valid snapshot, no clone needed.
    return { frames: this._state.frames, selection: this._state.selection };
  }

  /** Commit the current state as a new history step (call AFTER a completed op). */
  pushHistory() {
    this._undo.push(this.currentSnapshot());
    this._redo = [];
    this.commit({ canUndo: this._undo.length > 1, canRedo: false });
  }

  undo() {
    const h = this._activeHistory;
    if (this._state.activeId !== null && h) {
      if (h.canUndo()) return h.undo(); // fine undo within the open frame
      this.deactivate({ discard: true }); // at the boundary → exit, then cross
    }
    if (this._undo.length <= 1) return; // [0] is the baseline
    this._redo.push(this._undo.pop()!);
    const prev = this._undo[this._undo.length - 1];
    this.commit({
      frames: prev.frames,
      selection: prev.selection,
      canUndo: this._undo.length > 1,
      canRedo: true,
    });
  }

  redo() {
    const h = this._activeHistory;
    if (this._state.activeId !== null && h) {
      if (h.canRedo()) return h.redo();
      this.deactivate({ discard: true });
    }
    const next = this._redo.pop();
    if (!next) return;
    this._undo.push(next);
    this.commit({
      frames: next.frames,
      selection: next.selection,
      canUndo: true,
      canRedo: this._redo.length > 0,
    });
  }

  // ── mutation (feature rung A — frame drag) ───────────────────────────────────

  /** Translate selected frames by a WORLD-space delta (drag). */
  translateSelection(dxWorld: number, dyWorld: number) {
    const sel = new Set(this._state.selection);
    if (sel.size === 0) return;
    const frames = this._state.frames.map((f) =>
      sel.has(f.id)
        ? {
            ...f,
            rect: { ...f.rect, x: f.rect.x + dxWorld, y: f.rect.y + dyWorld },
          }
        : f
    );
    this.commit({ frames });
  }
}

/** Encode a standalone SVG string as a `data:` URI for an inert <img>. */
export function svgToDataUri(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
