// DOM surface for @grida/svg-editor.
//
// This is the only file in the package that imports DOM types. The headless
// editor (`src/core/*` + `src/index.ts`) does not depend on this module.
//
// v1: HUD chrome (selection box, resize handles, marquee) is rendered to a
// canvas overlay by `@grida/hud`'s `Surface`. The SVG is rendered to a
// separate layer beneath. No more positioned `<div>` handles, no manual
// dblclick tracking, no surface-internal gesture state machine.
//
// Re-renders the SVG body from `editor.serialize()` on every editor state
// change. Not optimized — clean SVG out is more important than diff-render.

import type { TextEditor } from "@grida/text-editor";
import { createTextEditor } from "@grida/text-editor/dom";
import {
  Surface as HUDSurface,
  measurementToHUDDraw,
  snapGuideToHUDDraw,
  NO_MODS,
  type HUDDraw,
  type HUDLine,
  type HUDRect,
  type Intent,
  type SurfaceEvent,
  type Modifiers,
  type PointerButton,
  type SelectionShape,
  type SelectionGroup,
} from "@grida/hud";
import { cursors as hud_cursors } from "@grida/hud/cursors";
import { measure, type Measurement } from "@grida/cmath/_measurement";
import cmath from "@grida/cmath";
import { Camera } from "./core/camera";
import type {
  DomComputedResolver,
  Surface,
  SurfaceHandle,
  SvgEditor,
} from "./core/editor";
import {
  MemoizedGeometryProvider,
  type GeometryProvider,
} from "./core/geometry";
import {
  MemoizedHitShapeProvider,
  pick_at_world,
  type HitShape,
  type HitShapeDriver,
} from "./core/hit-shape";
import { hit_shape_of_doc, is_transparent_tag } from "./core/hit-shape-svg";
import type { Preview } from "@grida/history";
import { SnapSession, compute_neighborhood, snap_descent } from "./core/snap";
import { svg_parse } from "@grida/svg/parse";
import {
  NudgeDwellWatcher,
  TranslateOrchestrator,
  type TranslateOptions,
  type TranslateModifiers,
} from "./core/translate-pipeline";
import {
  ResizeOrchestrator,
  type ResizeModifiers,
  type ResizeOptions,
} from "./core/resize-pipeline";
import {
  RotateOrchestrator,
  type RotateModifiers,
  type RotateOptions,
} from "./core/rotate-pipeline";
import { is_resizable_node, type RotatableVerdict } from "./core/intents";
import { project_local_bbox } from "./core/transform";
import {
  compute_drag_attrs,
  default_attrs,
  initial_attrs,
  type DragModifiers,
} from "./core/insertions";
import { parse_paint } from "./core/paint";
import { Gestures } from "./gestures/gestures";
import { applyDefaultGestures } from "./gestures/defaults";
import { SvgTextSurface } from "./text-surface";
import type {
  InsertableTag,
  InsertPreviewSession,
  NodeId,
  Rect,
  Tool,
  Vec2,
} from "./types";
import { TOOL_CURSOR } from "./types";

// Re-exports of surface-scoped types that don't belong on the headless
// entry. Anything DOM-coupled (Camera, Gestures, MemoizedGeometryProvider,
// SnapOptions, DomComputed*) lives here.
export { Camera } from "./core/camera";
export type {
  BoundsResolver,
  CameraConstraints,
  CameraOptions,
} from "./core/camera";
export { MemoizedGeometryProvider } from "./core/geometry";
export type { GeometryProvider, GeometrySignals } from "./core/geometry";
export { DEFAULT_SNAP_OPTIONS } from "./core/snap";
export type { SnapOptions } from "./core/snap";
export { Gestures } from "./gestures/gestures";
export type { GestureBinding, GestureContext, GestureId } from "./gestures";
export type { DomComputedPaint, DomComputedResolver } from "./core/editor";

/** Stamped on every rendered SVG element by `render()` so external
 *  tooling (host inspectors, the layers panel, snapshot tests) can map
 *  a DOM node back to its `NodeId`. The cmath fat-hit picker doesn't
 *  use it — see `_pick_node_at_world`. The legacy elementFromPoint
 *  fallback (active when `hit_tolerance_px <= 0`) walks up via
 *  {@link walk_to_id} below. */
const ID_ATTR = "data-grida-id";

/** Walk from `target` up through `parentElement`, returning the first id
 *  found on a `[data-grida-id]` ancestor. When `exclude_root` matches an
 *  encountered id, the walk stops and returns `null` — selection HUD
 *  treats root as non-selectable; measurement HUD passes `undefined`
 *  so the root id can be returned. */
function walk_to_id(
  target: Element | null,
  exclude_root?: NodeId
): NodeId | null {
  let cur: Element | null = target;
  while (cur instanceof Element) {
    const id = cur.getAttribute(ID_ATTR);
    if (id) return id === exclude_root ? null : id;
    cur = cur.parentElement;
  }
  return null;
}

const SVG_HUD_GROUP = {
  selection: "svg-editor.selection",
  selectionControls: "svg-editor.selection-controls",
  sizeMeter: "svg-editor.size-meter",
  memberOutline: "svg-editor.member-outline",
} as const;

/** KeyboardEvent.key values for the modifiers the surface tracks. Used to
 *  short-circuit window-level `keydown`/`keyup` for non-modifier keystrokes. */
const IS_MODIFIER_KEY: Record<string, true> = {
  Shift: true,
  Alt: true,
  Meta: true,
  Control: true,
};
/** Sentinel placed in `text_edit` before `createTextEditor` returns, so the
 *  surface skips render() during the in-flight mount and doesn't yank the
 *  live `<text>` element out from under the about-to-mount text surface. */
const TEXT_EDIT_PENDING = { __pending: true } as const;

export type DomSurfaceOptions = {
  /** Mount the SVG inside this container. */
  container: HTMLElement;
  /**
   * Install the default gesture set (wheel-pan/zoom, space-drag, middle-mouse,
   * keyboard zoom). Default `true`. Pass `false` to start blank and bind à la
   * carte via `handle.gestures.bind(...)`.
   */
  gestures?: boolean;
  /**
   * Auto-fit the document into the viewport on initial attach. Default
   * `false`. Mirrors Excalidraw's `initialData.scrollToContent`.
   * Subsequent `editor.load()` calls do NOT re-fit — call
   * `handle.camera.fit("<root>")` yourself if you want that behavior.
   */
  fit?: boolean;
  /**
   * Initial camera transform. Default `cmath.transform.identity`. Ignored
   * when `fit: true`.
   */
  initial_camera?: cmath.Transform;
};

/**
 * Surface handle for the DOM surface. Extends the editor's core
 * `SurfaceHandle` with the viewport-scoped concerns: pan/zoom (`camera`)
 * and pointer/wheel/keyboard gesture bindings (`gestures`).
 *
 * Camera + gestures are **surface-scoped**: detaching the surface drops
 * both. They never appear on the headless `SvgEditor`.
 */
export type DomSurfaceHandle = SurfaceHandle & {
  camera: Camera;
  gestures: Gestures;
};

/**
 * Attach a DOM surface to a headless editor. Returns a `DomSurfaceHandle`
 * whose `detach()` is the inverse — DOM cleared, listeners removed,
 * gestures uninstalled.
 *
 * Usage is one-shot per container: the surface owns the container's children
 * for its lifetime, and `detach()` restores it to empty.
 */
export function attach_dom_surface(
  editor: SvgEditor,
  options: DomSurfaceOptions
): DomSurfaceHandle {
  const surface = new DomSurface(editor, options);
  const inner = editor.attach(surface);
  return {
    detach: () => {
      surface.detach_gestures();
      inner.detach();
    },
    camera: surface.camera,
    gestures: surface.gestures,
  };
}

/** Fields shared by every phase of an in-flight insertion gesture. */
type PendingInsertCommon = {
  tag: InsertableTag;
  /** World-space pointer-down point. Fixed for the lifetime of the gesture. */
  anchor: Vec2;
  /** Screen-space (container CSS px) projection of the anchor at gesture
   *  start. Cached so per-frame pointer handlers don't need to call
   *  `camera.world_to_screen` on the same input every frame. Stale only
   *  if the camera pans/zooms mid-drag — gestures are mutually exclusive
   *  with pan/zoom in v1, so the staleness window is unreachable. */
  anchor_screen: Vec2;
};

class DomSurface implements Surface {
  private svg_root: SVGSVGElement | null = null;
  private hud_canvas: HTMLCanvasElement;
  private hud: HUDSurface;
  private teardown: Array<() => void> = [];
  private element_index = new Map<NodeId, SVGElement>();
  /** Last pointer position in container-local CSS px. Tracked separately from
   *  HUD hover so the measurement HUD can run its own hit-test that allows
   *  the `<svg>` root (which `hit_test` excludes for selection purposes).
   *  Mutated in place on every `pointermove` to avoid per-event allocation;
   *  `last_pointer_valid` distinguishes "never observed" from "at (0,0)". */
  private last_pointer: Vec2 = { x: 0, y: 0 };
  private last_pointer_valid = false;
  private resize_observer: ResizeObserver | null = null;
  /** Pending RAF for `request_redraw`. Coalesces N emits within a frame
   *  into one HUD draw — see the `subscribe_geometry` wiring. */
  private redraw_raf_id: number | null = null;
  /** Translate funnel — owns SnapSession + history.preview + baseline
   *  capture for drag, and any future translate gestures. The
   *  orchestrator is constructed once and lives for the surface's
   *  lifetime; per-gesture state lives inside it. */
  private translate_orchestrator!: TranslateOrchestrator;
  /** Surface-side observer that shows a snap guide after a *nudge*
   *  settles. Lives outside the keystroke critical path — see
   *  `core/translate-pipeline/nudge-dwell-watcher.ts`. */
  private nudge_dwell_watcher!: NudgeDwellWatcher;
  /** Surface-scoped pan/zoom. Public via `handle.camera`. */
  readonly camera: Camera;
  /** Surface-scoped gesture layer. Public via `handle.gestures`. */
  readonly gestures: Gestures;
  /** One-shot: cleared after the post-mount RAF honors `options.fit`. */
  private fit_on_attach: boolean;
  /** Container element (cached from options). */
  private readonly container: HTMLElement;
  /** Surface-side handle on the memoized geometry provider — drives both
   *  `bounds_of` reads and the fat-hit picker's AABB pre-filter. Same
   *  instance the editor core sees via `_internal.set_geometry`. */
  private _geometry_provider: MemoizedGeometryProvider | null = null;
  /** Per-node hit-shape cache, invalidated by the same signals as the
   *  geometry provider. `null` outside the attached lifetime. */
  private _hit_shapes: MemoizedHitShapeProvider | null = null;
  /** Depth-first document-order id list, last = topmost in SVG paint
   *  order. Rebuilt lazily on first pick after `structure_version`
   *  bumps. Excludes the root unless the picker is asked to consider it. */
  private _z_order_cache: NodeId[] = [];
  private _z_order_dirty = true;

  /** Resize funnel — owns SnapSession + history.preview + baseline
   *  capture for HUD resize gestures. Same shape as translate funnel. */
  private resize_orchestrator!: ResizeOrchestrator;
  /** Rotate funnel — owns history.preview + baseline capture for HUD
   *  rotate gestures. Same shape as resize. No snap session in v1 (no
   *  geometry / pixel-grid snap for rotation); angle snap is a pure
   *  pipeline stage. */
  private rotate_orchestrator!: RotateOrchestrator;
  // Active history.preview session for the in-flight gesture. Translate
  // and resize gestures live inside their respective orchestrators; this
  // field tracks endpoint gestures only.
  private active_preview: {
    kind: "endpoint";
    id: NodeId;
    endpoint: "p1" | "p2";
    /** Initial attrs at gesture start, in own (SVG) coords. */
    initial: { x1: number; y1: number; x2: number; y2: number };
    session: Preview;
  } | null = null;

  /** Active text-edit session (null when not in edit-content mode). */
  private text_edit: TextEditor | null = null;
  private text_edit_target: NodeId | null = null;
  private text_edit_original: string = "";

  /** Cached `editor.state.tool`; updated inside the `editor.subscribe`
   *  block. Pointer events read this in the hot path so the per-event
   *  `editor.state` getter (which freezes a fresh snapshot) stays cold. */
  private current_tool: Tool = TOOL_CURSOR;

  /** Active insertion gesture. `armed` = pointer down, IR untouched, drag
   *  threshold not yet crossed. `drawing` = preview session open, node
   *  live in IR and selected, per-frame moves push geometry attrs.
   *  Click-no-drag commits from `armed` via `commands.insert`; drag commits
   *  from `drawing` via `session.commit`. See `TODO.md` for the deferred
   *  HUD-routing migration when a second insertion-class tool lands. */
  private pending_insert:
    | (PendingInsertCommon & { phase: "armed" })
    | (PendingInsertCommon & {
        phase: "drawing";
        session: InsertPreviewSession;
        snap_session: SnapSession | null;
      })
    | null = null;

  constructor(
    private readonly editor: SvgEditor,
    options: DomSurfaceOptions
  ) {
    this.container = options.container;
    const container = this.container;
    this.fit_on_attach = options.fit === true;
    // The container is exclusively owned by the surface — interactive
    // children break pointer routing (capture redirects pointerup off
    // them, so the browser never synthesizes a click). Surface the
    // violation loudly in dev; non-fatal because some hosts mount
    // benign children (style tags, dev overlays) we can't reason about.
    if (
      process.env.NODE_ENV !== "production" &&
      container.children.length > 0
    ) {
      console.warn(
        "@grida/svg-editor: surface container is not empty at attach time. " +
          "Render chrome (toolbars, layer lists, inspectors) as siblings " +
          "of the container, not children — otherwise clicks on those " +
          "children will silently break. See README §Surface."
      );
    }
    if (getComputedStyle(container).position === "static") {
      container.style.position = "relative";
    }
    // Suppress native text selection / drag-ghost on SVG content. The HUD
    // surface owns all gesture state — letting the browser highlight text
    // mid-drag is just visual noise.
    container.style.userSelect = "none";
    (
      container.style as CSSStyleDeclaration & { webkitUserSelect?: string }
    ).webkitUserSelect = "none";

    // Derive pipeline options from current style. Shared by the
    // orchestrator (drag gestures) and the nudge-dwell watcher (after-
    // effect snap guide). Re-evaluated per call so runtime style flips
    // — e.g. flipping `snap_to_pixel_grid` mid-drag — take effect on
    // the next frame.
    const translate_options = (): TranslateOptions => {
      const style = this.editor.style;
      // Snap threshold is a CSS-pixel intent from the user; the
      // pipeline lives in world space (one document unit per integer),
      // so convert before passing through. Pixel-grid quantum is
      // already in world units (document units) per the style spec.
      const zoom = this.camera.zoom || 1;
      return {
        pixel_grid_quantum: style.snap_to_pixel_grid
          ? style.pixel_grid_size
          : null,
        snap_enabled: style.snap_enabled,
        snap_threshold_px: style.snap_threshold_px / zoom,
      };
    };

    // Translate funnel. Instantiated early so the first `redraw()` (which
    // calls `compute_snap_extra` → reads `translate_orchestrator.last_guides`)
    // sees a valid instance. Per-gesture state lives inside it.
    //
    // Pipeline math runs in world space (root-SVG own-user units). The
    // adapter is responsible for converting CSS-pixel cursor deltas to
    // world deltas (`handle_translate`/`handle_resize`) and for
    // projecting snap guides world → screen at HUD paint time
    // (`compute_snap_extra`).
    // Drag commits stay off the translate-commit bus — see
    // nudge-dwell-watcher.ts header for the dwell carve-out.
    this.translate_orchestrator = new TranslateOrchestrator({
      get_doc: () => this.editor_internal().doc,
      emit: () => this.editor_internal().emit(),
      open_preview: (label) => this.editor_internal().history.preview(label),
      open_snap: (ids) => this.open_snap_session_for(ids),
      options: translate_options,
    });

    // Resize funnel — same shape as translate, distinct lifecycle.
    // Snap session is opened per-gesture; the world-space baseline is
    // captured from `bbox_world` (`getBBox` for flat docs) on the
    // first frame.
    const resize_options = (): ResizeOptions => {
      const style = this.editor.style;
      // Snap/pixel-grid options are CSS-pixel intents from the user;
      // convert to world units so the pipeline (which operates in world
      // space) interprets them as the user intended on screen.
      const zoom = this.camera.zoom || 1;
      return {
        pixel_grid_quantum: style.snap_to_pixel_grid
          ? style.pixel_grid_size
          : null,
        snap_enabled: style.snap_enabled,
        snap_threshold_px: style.snap_threshold_px / zoom,
      };
    };
    this.resize_orchestrator = new ResizeOrchestrator({
      get_doc: () => this.editor_internal().doc,
      emit: () => this.editor_internal().emit(),
      open_preview: (label) => this.editor_internal().history.preview(label),
      open_snap: (ids) => this.open_snap_session_for(ids),
      options: resize_options,
      bbox_world: (id) =>
        this.bbox_world(id) ?? { x: 0, y: 0, width: 0, height: 0 },
    });

    // Rotate funnel — no snap session (rotation snap is angle-only,
    // computed inside the pipeline stage). Same `bbox_world` source as
    // resize so the pivot lands on the bbox-center of the world AABB.
    const rotate_options = (): RotateOptions => ({
      angle_snap_step_radians: this.editor.style.angle_snap_step_radians,
    });
    this.rotate_orchestrator = new RotateOrchestrator({
      get_doc: () => this.editor_internal().doc,
      emit: () => this.editor_internal().emit(),
      open_preview: (label) => this.editor_internal().history.preview(label),
      options: rotate_options,
      bbox_world: (id) =>
        this.bbox_world(id) ?? { x: 0, y: 0, width: 0, height: 0 },
    });

    // See nudge-dwell-watcher.ts header for the trigger contract.
    const editor_ref = this.editor;
    const editor_for_watcher: import("./core/translate-pipeline/nudge-dwell-watcher").NudgeDwellEditorPort =
      {
        get document() {
          return editor_ref.document;
        },
        get state() {
          return editor_ref.state;
        },
        subscribe_translate_commit: (cb) =>
          this.editor_internal().subscribe_translate_commit(cb),
      };
    this.nudge_dwell_watcher = new NudgeDwellWatcher({
      editor: editor_for_watcher,
      open_snap: (ids) => this.open_snap_session_for(ids),
      options: translate_options,
      on_guides_change: () => this.request_redraw(),
      window: container.ownerDocument.defaultView ?? window,
    });
    this.teardown.push(() => this.nudge_dwell_watcher.dispose());

    // Mount canvas HUD on top of the (yet-to-be-mounted) SVG.
    this.hud_canvas = container.ownerDocument.createElement("canvas");
    Object.assign(this.hud_canvas.style, {
      position: "absolute",
      left: "0",
      top: "0",
      pointerEvents: "none",
    });
    container.appendChild(this.hud_canvas);

    // Build the HUD surface — providers wired to editor + container geometry.
    this.hud = new HUDSurface(this.hud_canvas, {
      pick: (p) => this.hit_test(p[0], p[1]),
      shapeOf: (id) => this.shape_of(id),
      onIntent: (i) => this.commit_intent(i),
      style: {
        chromeColor: editor.style.chrome_color,
        // v1 ships rotation: the chrome builder draws a rotation knob
        // outside each corner when this is on. The single-vs-multi gate
        // is lifted on the HUD side.
        showRotationHandles: true,
      },
      groups: {
        selection: SVG_HUD_GROUP.selection,
        selectionControls: SVG_HUD_GROUP.selectionControls,
      },
      visibility: ({ gesture }) => {
        if (gesture.kind !== "translate") return undefined;
        return {
          hidden: [
            SVG_HUD_GROUP.selection,
            SVG_HUD_GROUP.selectionControls,
            SVG_HUD_GROUP.sizeMeter,
          ],
        };
      },
      // Pixel grid is named HUD chrome — drawn back-most below selection
      // chrome only once the camera zooms past pixel-readable scale (~4×).
      // See @grida/hud README "Extending the HUD". We feed the camera
      // transform explicitly because this surface keeps the HUD canvas's
      // chrome transform at identity (the camera is applied as a CSS
      // transform on the <svg> instead — see `apply_camera_transform`).
      pixelGrid: {
        enabled: editor.style.pixel_grid,
        zoomThreshold: 4,
        transform: options.initial_camera,
      },
    });

    // Opt into the bundled rotation-aware cursor SVGs. Replaces the
    // crosshair fallback for the rotate handle and gives resize knobs
    // proper diagonal-arrow art per corner. Pure CSS-string output;
    // sync_cursor() below calls `this.hud.cursorCss()` instead of
    // hand-rolling the icon → CSS mapping.
    this.hud.setCursorRenderer(hud_cursors.defaultRenderer());

    // Camera (surface-scoped pan/zoom) — wired before initial render so the
    // first apply_camera_transform() puts the SVG at the right place.
    this.camera = new Camera({
      resolve_bounds: (target) => this.resolve_world_bounds(target),
      initial: options.initial_camera,
    });
    this.hud.setPixelGridTransform(this.camera.transform);
    this.teardown.push(
      this.camera.subscribe(() => {
        this.apply_camera_transform();
        this.hud.setPixelGridTransform(this.camera.transform);
        // Multi-member envelope chrome stores a baked union rect in
        // container space — re-resolve it against the new CTM. The
        // flat-NodeId path (singleton / empty) is a near no-op here.
        this.sync_surface_selection();
        this.redraw();
      })
    );

    // Initial SVG render + canvas size.
    this.render();
    this.sync_canvas_size();
    this.sync_surface_selection();
    this.redraw();
    // The container often gets its final size on the next frame (flex
    // settle, etc.) — re-sync once after layout has flushed. Also where we
    // honor `fit: true` (the camera needs the viewport size to compute
    // a sensible fit transform).
    const win = container.ownerDocument.defaultView ?? window;
    const raf = win.requestAnimationFrame(() => {
      this.sync_canvas_size();
      this.honor_initial_fit();
      this.redraw();
    });
    this.teardown.push(() => win.cancelAnimationFrame(raf));

    // Gesture layer — sibling to editor.keymap. Constructed AFTER camera so
    // installers can access `handle.camera` via the context.
    this.gestures = new Gestures({
      container,
      svg_root: () => this.svg_root,
      hud_canvas: this.hud_canvas,
      camera: this.camera,
      editor,
      // Handle is wrapped at the call site of attach_dom_surface; bindings
      // that need it can capture from `camera` / `editor` instead. We pass a
      // stub here that matches the SurfaceHandle shape — replaced by the
      // attach_dom_surface caller via setter below.
      handle: { detach: () => {} },
    });
    if (options.gestures !== false) {
      applyDefaultGestures(this.gestures);
    }

    // Re-render on any editor state change. Selection sync runs BEFORE
    // sync_canvas_size so the single redraw inside the latter paints with
    // the up-to-date HUD selection — eliminating a redundant draw per tick.
    // sync_canvas_size is cheap when the size is unchanged (HUDCanvas.setSize
    // is a no-op).
    const unsub = editor.subscribe(() => {
      this.current_tool = editor.state.tool;
      this.render();
      this.sync_surface_selection();
      // Sync pixel grid enabled state BEFORE sync_canvas_size — that call
      // re-paints the HUD internally and must see the latest flag. Cheap
      // idempotent re-sync; preserves the transform set by
      // `setPixelGridTransform` (see HUDCanvas.setPixelGrid merge logic).
      this.hud.setPixelGrid({
        enabled: editor.style.pixel_grid,
        zoomThreshold: 4,
      });
      this.sync_canvas_size();
      // Tool changes adjust the cursor (crosshair while inserting).
      // Idempotent — `sync_cursor` no-ops when CSS is already current.
      this.sync_cursor();
      // Tool switch mid-gesture cancels the in-flight insert. The
      // dispatcher itself can't observe this — the editor's state was
      // mutated programmatically (via toolbar click or external set_tool).
      // Only cancel when the user switched to a *different* insertable
      // tag (or to cursor while still in pre-draw `armed` phase). Once
      // the gesture has reached the `drawing` phase, the tool may have
      // already reverted to cursor as part of commit prep — don't fight
      // our own state machine.
      if (this.pending_insert) {
        const t = this.current_tool;
        const cur = this.pending_insert;
        const tag_changed =
          t.type === "insert" ? t.tag !== cur.tag : cur.phase === "armed";
        if (tag_changed) {
          if (cur.phase === "drawing") cur.session.discard();
          this.pending_insert = null;
        }
      }
      // Host extras re-feed: HUD reuses last-passed extras on its own redraws.
      this.request_redraw();
    });
    this.teardown.push(unsub);

    // Coalesce: a multi-attr drag fires `subscribe_geometry` per `set_attr`
    // (e.g. 10× per pointermove for a 5-rect translate). Without RAF folding,
    // each emit triggers a redraw that does N `getBBox`/`getCTM` reads.
    this.teardown.push(editor.subscribe_geometry(() => this.request_redraw()));

    // Track container size → resize the HUD canvas.
    if (typeof ResizeObserver !== "undefined") {
      this.resize_observer = new ResizeObserver(() => this.sync_canvas_size());
      this.resize_observer.observe(container);
      this.teardown.push(() => this.resize_observer?.disconnect());
    } else {
      const win = container.ownerDocument.defaultView ?? window;
      const fn = () => this.sync_canvas_size();
      win.addEventListener("resize", fn);
      this.teardown.push(() => win.removeEventListener("resize", fn));
    }

    this.wire_events();

    // Surface-side handlers for editor-registered drivers.
    const internal = (
      editor as unknown as {
        _internal: {
          set_content_edit_driver(
            fn: ((target: NodeId) => boolean) | null
          ): void;
          set_surface_hover_override_driver(
            fn: ((id: NodeId | null) => void) | null
          ): void;
          push_surface_hover(id: NodeId | null): void;
          set_computed_resolver(fn: DomComputedResolver | null): void;
          set_geometry(p: GeometryProvider | null): void;
        };
      }
    )._internal;
    this.editor_hover_internal = internal;
    internal.set_content_edit_driver((id) => this.enter_content_edit(id));
    this.teardown.push(() => internal.set_content_edit_driver(null));

    // Delegates to `getComputedStyle()` so `dom_computed_*` honors `<style>`
    // matching, `var()`, and inheritance — the cases the headless cascade
    // engine doesn't cover at v1.
    internal.set_computed_resolver({
      computed_property: (id, name) => {
        const el = this.element_index.get(id);
        if (!el) return null;
        const value = getComputedStyle(el).getPropertyValue(name);
        return value === "" ? null : value;
      },
      computed_paint: (id, channel) => {
        const el = this.element_index.get(id);
        if (!el) return null;
        const computed = getComputedStyle(el).getPropertyValue(channel);
        if (computed === "") return null;
        return { computed, resolved_paint: parse_paint(computed) };
      },
    });
    this.teardown.push(() => internal.set_computed_resolver(null));

    // World-space geometry provider — the single source of truth for
    // bounds_of(id) queries across the package. Wrapped in a memoizer
    // that invalidates on structure / geometry version bumps; see
    // `core/geometry.ts` for the cache rationale.
    const driver = new SvgGeometryDriver({
      element_for: (id) => this.element_index.get(id) ?? null,
      root: () => this.svg_root,
      camera: () => this.camera,
      container: () => this.container,
      pick_at_world: (p, allow_root) => this._pick_node_at_world(p, allow_root),
    });
    const geometry = new MemoizedGeometryProvider(driver, {
      subscribe_structure: (cb) =>
        editor.subscribe_with_selector(
          (s) => s.structure_version,
          () => cb()
        ),
      subscribe_geometry: (cb) => editor.subscribe_geometry(cb),
    });
    this._geometry_provider = geometry;
    internal.set_geometry(geometry);
    this.teardown.push(() => {
      internal.set_geometry(null);
      geometry.dispose();
      this._geometry_provider = null;
    });

    // Hit-shape provider — drives the fat-hit picker so thin elements
    // (1-px lines, hairline strokes) remain selectable within a screen-
    // space tolerance band. Cache invalidation rides the same version
    // counters as `geometry`; the driver reads geometry attributes from
    // the authoritative `SvgDocument` rather than the live DOM.
    const hit_driver = new SvgHitShapeDriver({
      doc: () => {
        try {
          return this.editor_internal().doc;
        } catch {
          return null;
        }
      },
      bounds_of: (id) => geometry.bounds_of(id),
    });
    const hit_shapes = new MemoizedHitShapeProvider(hit_driver, {
      subscribe_structure: (cb) =>
        editor.subscribe_with_selector(
          (s) => s.structure_version,
          () => cb()
        ),
      subscribe_geometry: (cb) => editor.subscribe_geometry(cb),
    });
    this._hit_shapes = hit_shapes;
    // Z-order list — depth-first document order, last = topmost. Only
    // invalidates on structure changes (insert/remove/reorder); attribute
    // tweaks don't touch it. Lazy: rebuilt on first pick after each bump.
    this._z_order_dirty = true;
    this.teardown.push(
      editor.subscribe_with_selector(
        (s) => s.structure_version,
        () => {
          this._z_order_dirty = true;
        }
      )
    );
    this.teardown.push(() => {
      hit_shapes.dispose();
      this._hit_shapes = null;
      this._z_order_cache = [];
    });

    // Bidirectional hover bridge — HUD ↔ editor's surface_hover channel.
    // Out-of-canvas UI (e.g. layers panel) reads via editor.surface_hover()
    // and writes via editor.set_surface_hover_override(); we plumb both
    // ends through the HUD here.
    internal.set_surface_hover_override_driver((id) => {
      const response = this.hud.setHoverOverride(id);
      if (response.hoverChanged) {
        internal.push_surface_hover(this.hud.hover());
      }
      if (response.needsRedraw) this.redraw();
    });
    this.teardown.push(() => internal.set_surface_hover_override_driver(null));
  }

  /** Cached `_internal` reference for pushing hover updates after dispatch. */
  private editor_hover_internal: {
    push_surface_hover(id: NodeId | null): void;
  } | null = null;

  // ─── Surface interface (editor.attach contract) ─────────────────────────

  paint(_snapshot: unknown): void {
    // No-op for v0 — we re-serialize on every subscribe.
  }

  hit_test(x: number, y: number): NodeId | null {
    return this.pick_at(x, y, false);
  }

  /** Element-walk under (x, y) → first ancestor with `ID_ATTR`. When
   *  `allow_root` is `false`, root hits are rejected (returns `null`) so
   *  the HUD never hovers / selects / drags the document itself —
   *  selection of the root is a host concern. When `true`, the root id
   *  is returned for callers that need it as a measurement candidate
   *  (`<svg>` is a snap target and should be a measurement target too;
   *  see `compute_measurement_extra`). */
  private pick_at(x: number, y: number, allow_root: boolean): NodeId | null {
    // (x, y) is container-local CSS px. Run the picker in world space so
    // we share one implementation between this entry point and the
    // GeometryProvider's `node_at_point`.
    const world = this.camera.screen_to_world({ x, y });
    return this._pick_node_at_world(world, allow_root);
  }

  /** Resolve a world-space point to a node id.
   *
   *  Two paths, selected at runtime by `EditorStyle.hit_tolerance_px`:
   *
   *    - **`> 0` (cmath fat-hit picker)** — walks document z-order
   *      topmost-first via {@link pick_at_world}. Each candidate's
   *      hit-shape comes from the memoized `SvgHitShapeDriver`
   *      (intrinsic geometry or world-space bounds-rect fallback for
   *      `<text>` / `<use>` / transformed nodes). Tolerance is screen-
   *      CSS-px, converted to world units via `camera.zoom` so the band
   *      stays the same width on screen regardless of zoom. Has known
   *      issues — see `docs/wg/feat-svg-editor/hit-test.md`.
   *
   *    - **`<= 0` (legacy elementFromPoint)** — opt-out of the cmath
   *      picker. Uses the browser's painted-pixel hit-test plus a
   *      walk-up of `data-grida-id`. Pixel-exact, no tolerance, but
   *      renderer-correct on every real-world SVG feature (transforms,
   *      cascade, clip-path, fill-rule, pointer-events). This is the
   *      v1-baseline path; useful for A/B comparison and as a safe
   *      fallback if the cmath path misbehaves.
   *
   *  `allow_root` controls whether the root `<svg>` may be returned:
   *  selection HUD passes `false`, measurement HUD passes `true`.
   *
   *  Used by both `pick_at` (HUD hover / measurement) and
   *  `SvgGeometryDriver.node_at_point` (core editor selection) so one
   *  source of truth governs every click that resolves to a node. */
  private _pick_node_at_world(p: Vec2, allow_root: boolean): NodeId | null {
    const root_id = this.editor.tree().root;
    const tol_px = this.editor.style.hit_tolerance_px;
    if (tol_px <= 0) return this._pick_node_via_dom(p, allow_root, root_id);
    const geometry = this._geometry_provider;
    const hit_shapes = this._hit_shapes;
    if (geometry && hit_shapes) {
      const zoom = this.camera.zoom;
      const tolerance_world = zoom > 0 ? tol_px / zoom : 0;
      const ordered = this._ensure_z_order(false, root_id);
      const hit = pick_at_world(p, {
        tolerance_world,
        ordered_ids: ordered,
        bounds_of: (id) => geometry.bounds_of(id),
        hit_shape_of: (id) => hit_shapes.hit_shape_of(id),
      });
      if (hit !== null) return hit;
    }
    if (allow_root && geometry) {
      const root_bounds = geometry.bounds_of(root_id);
      if (root_bounds && cmath.rect.containsPoint(root_bounds, [p.x, p.y])) {
        return root_id;
      }
    }
    return null;
  }

  /** Legacy DOM-based picker. World point → container CSS px via camera,
   *  then `elementFromPoint` + walk-up to `data-grida-id`. No tolerance,
   *  no cmath, no z-order owned by us — the browser stacks paints and
   *  returns the topmost. The picker the package shipped with at v1. */
  private _pick_node_via_dom(
    p: Vec2,
    allow_root: boolean,
    root_id: NodeId
  ): NodeId | null {
    const screen = this.camera.world_to_screen(p);
    const cr = this.container.getBoundingClientRect();
    const owner_doc = this.container.ownerDocument;
    const target = owner_doc.elementFromPoint(
      cr.left + screen.x,
      cr.top + screen.y
    );
    if (!(target instanceof SVGElement)) return null;
    return walk_to_id(target, allow_root ? undefined : root_id);
  }

  /** Lazily rebuild the z-order list. Walks the document depth-first,
   *  emitting element ids in paint order (back → front). The root is
   *  always pushed first; callers that disallow root pass `false` to
   *  have the picker skip it. (Cheaper to keep one canonical list and
   *  filter the root inline than to maintain two parallel arrays.) */
  private _ensure_z_order(
    allow_root: boolean,
    root_id: NodeId
  ): ReadonlyArray<NodeId> {
    if (this._z_order_dirty) {
      const out: NodeId[] = [];
      const doc = (() => {
        try {
          return this.editor_internal().doc;
        } catch {
          return null;
        }
      })();
      if (doc) {
        const walk = (id: NodeId) => {
          out.push(id);
          for (const c of doc.element_children_of(id)) walk(c);
        };
        walk(doc.root);
      }
      this._z_order_cache = out;
      this._z_order_dirty = false;
    }
    if (allow_root) return this._z_order_cache;
    // Filter root inline. Cheap — root is element[0].
    if (this._z_order_cache.length > 0 && this._z_order_cache[0] === root_id) {
      return this._z_order_cache.slice(1);
    }
    return this._z_order_cache.filter((id) => id !== root_id);
  }

  on_input(_listener: (event: unknown) => void): () => void {
    return () => {};
  }

  dispose(): void {
    if (this.text_edit) {
      this.text_edit.cancel();
      this.text_edit = null;
      this.text_edit_target = null;
    }
    this.gestures._dispose();
    // Cancel any in-flight gesture before RAFs are released. The
    // nudge-dwell watcher's teardown is queued separately (see ctor).
    this.translate_orchestrator.cancel();
    this.resize_orchestrator.cancel();
    this.rotate_orchestrator.cancel();
    this.active_preview = null;
    if (this.redraw_raf_id !== null) {
      const win = this.container.ownerDocument.defaultView ?? window;
      win.cancelAnimationFrame(this.redraw_raf_id);
      this.redraw_raf_id = null;
    }
    for (const fn of this.teardown) fn();
    this.teardown = [];
    this.hud.dispose();
    this.hud_canvas.remove();
    if (this.svg_root) this.svg_root.remove();
    this.svg_root = null;
    this.element_index.clear();
    this.last_pointer_valid = false;
  }

  /** Public — invoked by the `DomSurfaceHandle` wrapper before `detach()`. */
  detach_gestures(): void {
    this.gestures._dispose();
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  private render() {
    // During an active text-edit session the text element and its caret /
    // selection rect overlays are managed live by `SvgTextSurface`. Replacing
    // the SVG would yank them out. Skip the re-render until commit/cancel.
    if (this.text_edit) return;
    const owner_doc = this.container.ownerDocument;
    const internal = (
      this.editor as unknown as {
        _internal: { doc: import("./core/document").SvgDocument };
      }
    )._internal;
    const doc = internal.doc;
    const svg_text = this.editor.serialize();

    const wrapper = owner_doc.createElement("div");
    wrapper.innerHTML = svg_text;
    const new_svg = wrapper.querySelector("svg");
    if (!(new_svg instanceof SVGSVGElement)) return;

    if (this.svg_root) {
      this.svg_root.replaceWith(new_svg);
    } else {
      // Insert before the HUD canvas so the canvas sits on top.
      this.container.insertBefore(new_svg, this.hud_canvas);
    }
    this.svg_root = new_svg;
    // Camera applies a CSS transform on the SVG; the SVG must be absolutely
    // positioned at the container's top-left and use transform-origin 0,0
    // so the matrix maps SVG-coord (0,0) to screen (tx, ty) cleanly.
    this.apply_svg_layout();
    this.apply_camera_transform();

    // Tag DOM elements with their IR ids by walking IR-element-order and the
    // parsed DOM in parallel. Both walks are pre-order, element-only, so the
    // sequences align 1:1: `all_elements()` is a pre-order walk filtered to
    // element nodes; `serialize()` emits in the same order; the browser
    // parses XML preserving document order. Tagging happens in DOM-space, so
    // the IR is never mutated — eliminating the 2N `set_attr` writes that
    // previously triggered every `doc.on_change` listener N times per render.
    this.element_index.clear();
    const ids = doc.all_elements();
    let i = 0;
    const tag_walk = (el: SVGElement) => {
      if (i < ids.length) {
        const id = ids[i++];
        el.setAttribute(ID_ATTR, id);
        this.element_index.set(id, el);
      }
      for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (c instanceof SVGElement) tag_walk(c);
      }
    };
    tag_walk(new_svg);
  }

  private sync_canvas_size() {
    const cr = this.container.getBoundingClientRect();
    this.hud.setSize(cr.width, cr.height);
    // Push viewport size to the camera so `camera.fit`, `bounds`, `center`
    // compute against the live container dimensions.
    this.camera._set_viewport_size(cr.width, cr.height);
    this.redraw();
  }

  /**
   * Apply absolute positioning + transform-origin to the SVG so the camera's
   * CSS matrix maps SVG-coord (0,0) cleanly to container-screen (tx, ty).
   * Called after every render() that may have replaced the root element.
   */
  private apply_svg_layout(): void {
    if (!this.svg_root) return;
    const style = this.svg_root.style;
    style.position = "absolute";
    style.left = "0";
    style.top = "0";
    style.transformOrigin = "0 0";
    // The SVG's intrinsic width/height attributes still define its content
    // area; CSS transform scales/translates it on top.
  }

  /**
   * Push the current camera transform to the SVG as a CSS `matrix(...)`.
   * The HUD canvas stays at identity — selection chrome reads node bounds
   * via `getScreenCTM()`, which already includes the CSS transform, so
   * chrome aligns automatically and stays 1px sharp at any zoom.
   */
  private apply_camera_transform(): void {
    if (!this.svg_root) return;
    const t = this.camera.transform;
    // CSS matrix(a, b, c, d, e, f) maps (x, y) → (a*x + c*y + e, b*x + d*y + f).
    // Our cmath.Transform [[a, b, tx], [c, d, ty]] uses the same convention
    // with (a, c, b, d, tx, ty) ordering swap.
    this.svg_root.style.transform = `matrix(${t[0][0]}, ${t[1][0]}, ${t[0][1]}, ${t[1][1]}, ${t[0][2]}, ${t[1][2]})`;
  }

  /** One-shot fit-on-attach. Runs after layout has settled. */
  private honor_initial_fit(): void {
    if (!this.fit_on_attach) return;
    this.fit_on_attach = false;
    this.camera.fit("<root>");
  }

  /**
   * BoundsResolver for `Camera.fit(target)`. The Camera class handles Rect
   * passthrough itself; this resolver only sees string targets — sentinels
   * ("<root>", "<selection>") and NodeIds.
   */
  private resolve_world_bounds(
    target: "<root>" | "<selection>" | NodeId
  ): Rect | null {
    if (target === "<root>") return this.root_world_bounds();
    const geometry = this.editor.geometry;
    if (target === "<selection>") {
      const sel = this.editor.state.selection;
      if (sel.length === 0 || !geometry) return null;
      const rects = [...geometry.bounds_of_many(sel).values()];
      if (rects.length === 0) return null;
      return cmath.rect.union(rects);
    }
    return geometry?.bounds_of(target) ?? null;
  }

  /**
   * World-space bounds of the root document. Prefer `viewBox` (the SVG's
   * declared world rect), fall back to `width`/`height` attrs, then the
   * SVG root's `getBBox()` as a last resort.
   */
  private root_world_bounds(): Rect | null {
    const root_id = this.editor.tree().root;
    const doc = this.editor.document;
    const view_box = doc.get_attr(root_id, "viewBox");
    if (view_box) {
      const parts = view_box
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        return {
          x: parts[0],
          y: parts[1],
          width: parts[2],
          height: parts[3],
        };
      }
    }
    const w = parseFloat(doc.get_attr(root_id, "width") ?? "");
    const h = parseFloat(doc.get_attr(root_id, "height") ?? "");
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return { x: 0, y: 0, width: w, height: h };
    }
    if (this.svg_root) {
      try {
        const b = this.svg_root.getBBox();
        if (b.width > 0 && b.height > 0) {
          return { x: b.x, y: b.y, width: b.width, height: b.height };
        }
      } catch {
        /* SVG not yet laid out; bail */
      }
    }
    return null;
  }

  /** Single per-frame draw entry — merges host-fed extras with surface chrome. */
  private redraw(): void {
    this.hud.draw(
      merge_hud_draws(
        this.compute_measurement_extra(),
        this.compute_size_meter_extra(),
        this.compute_snap_extra(),
        this.compute_member_outlines_extra()
      )
    );
  }

  /** RAF-coalesced `redraw` for event sources that may emit many times per
   *  frame (geometry-version bumps mid-drag). Camera/gesture paths still call
   *  `redraw` directly for synchronous chrome alignment. */
  private request_redraw(): void {
    if (this.redraw_raf_id !== null) return;
    const win = this.container.ownerDocument.defaultView ?? window;
    this.redraw_raf_id = win.requestAnimationFrame(() => {
      this.redraw_raf_id = null;
      this.redraw();
    });
  }

  /**
   * Build the host-fed measurement guide for the current frame, or
   * `undefined` if no guide should be drawn.
   *
   * Master signal: Alt held (read from `surface.modifiers()`). Each
   * additional condition is a derivation, not a separate flag — this keeps
   * a single source of truth and lets future Alt-consumers (constrained
   * resize, axis-lock, …) live next to this one without re-tracking the key.
   */
  private compute_measurement_extra(): HUDDraw | undefined {
    const mods = this.hud.modifiers();
    if (!mods.alt) return undefined;
    if (this.hud.gesture().kind !== "idle") return undefined;
    const sel = this.editor.state.selection;
    if (sel.length === 0) return undefined;
    // The `<svg>` root is a snap target (see `compute_neighborhood` /
    // `bounds_of`) and should be a measurement target too. `hit_test`
    // rejects root for selection's sake, so when the standard hover
    // pick is empty, re-hit-test with `allow_root` to recover the
    // root as a candidate.
    let hover = this.hud.hover();
    if (!hover && this.last_pointer_valid) {
      hover = this.pick_at(this.last_pointer.x, this.last_pointer.y, true);
    }
    if (!hover) return undefined;
    if (sel.includes(hover)) return undefined;

    // Two measurements:
    //   container-space — drives the HUD's pixel-aligned visual (line
    //     lengths, rect outlines must match the rendered SVG).
    //   world-space — drives the reported distance labels (what the
    //     user authored, not what the camera scaled).
    // We feed container rects to measurementToHUDDraw, then overwrite
    // the primary labels with formatted world-space distances.
    const a_container = sel
      .map((id) => this.container_box(id))
      .filter((r): r is Rect => r !== null);
    if (a_container.length === 0) return undefined;
    const b_container = this.container_box(hover);
    if (!b_container) return undefined;
    const m_container = measure(cmath.rect.union(a_container), b_container);
    if (!m_container) return undefined;

    const draw = measurementToHUDDraw(
      m_container,
      this.editor.style.measurement_color
    );

    const geometry = this.editor.geometry;
    if (geometry) {
      const a_world = sel
        .map((id) => geometry.bounds_of(id))
        .filter((r): r is Rect => r !== null);
      const b_world = geometry.bounds_of(hover);
      if (a_world.length > 0 && b_world) {
        const m_world = measure(cmath.rect.union(a_world), b_world);
        if (m_world) {
          // Both measurements visit sides in [top, right, bottom, left]
          // order; a labelled line exists iff both distances are > 0.
          let cursor = 0;
          for (const line of draw.lines ?? []) {
            if (line.label === undefined) continue;
            const side = next_labellable_side(cursor, m_container, m_world);
            if (side < 0) break;
            line.label = cmath.ui.formatNumber(m_world.distance[side], 1);
            cursor = side + 1;
          }
        }
      }
    }

    return draw;
  }

  /** Pill position is container-space (tracks camera); values are
   *  world-space (zoom-invariant). Hidden in text-edit mode. */
  private compute_size_meter_extra(): HUDDraw | undefined {
    if (!this.editor.style.show_size_meter) return undefined;
    if (this.editor.state.mode === "edit-content") return undefined;
    const sel = this.editor.state.selection;
    if (sel.length === 0) return undefined;
    const geometry = this.editor.geometry;
    if (!geometry) return undefined;
    const color = this.editor.style.chrome_color;

    // Single-selection: anchor the pill on the visually-lowest side
    // (the edge whose midpoint has the maximum container-Y), with the
    // pill rotated parallel to that edge. For a rotated rect this
    // picks the screen-bottom edge regardless of which local edge ended
    // up there (e.g. a 90°-rotated rect anchors on what was the local
    // right edge). For a line, the only edge IS the line — pill sits
    // at its midpoint, oriented along it. Label dims still come from
    // the artwork's local frame (so a 100×100 rotated rect shows
    // "100 × 100", not the AABB-of-rotated "141 × 141").
    if (sel.length === 1) {
      const shape = this.shape_of(sel[0]);
      if (shape && shape.kind === "transformed") {
        const { local, matrix } = shape;
        const corners = cmath.rect
          .toCorners(local)
          .map((p) => cmath.vector2.transform(p, matrix));
        const { anchor, angle } = pick_lowest_side_anchor(corners, true);
        const label = `${cmath.ui.formatNumber(local.width, 1)} × ${cmath.ui.formatNumber(local.height, 1)}`;
        return {
          lines: [
            {
              x1: anchor[0],
              y1: anchor[1],
              x2: anchor[0],
              y2: anchor[1],
              label,
              color,
              labelAngle: angle,
              group: SVG_HUD_GROUP.sizeMeter,
            },
          ],
        };
      }
      if (shape && shape.kind === "line") {
        const { p1, p2 } = shape;
        const { anchor, angle } = pick_lowest_side_anchor([p1, p2], false);
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const label = `${cmath.ui.formatNumber(Math.abs(dx), 1)} × ${cmath.ui.formatNumber(Math.abs(dy), 1)}`;
        return {
          lines: [
            {
              x1: anchor[0],
              y1: anchor[1],
              x2: anchor[0],
              y2: anchor[1],
              label,
              color,
              labelAngle: angle,
              group: SVG_HUD_GROUP.sizeMeter,
            },
          ],
        };
      }
    }

    // One label per selection — the union of world bboxes for the W×H
    // text, the union of container-space bboxes for the pill anchor.
    // This matches the "one chrome envelope" UX: the size meter shows
    // the dimensions of the rect the user will resize as a unit.
    const world_rects: Rect[] = [];
    const container_rects: Rect[] = [];
    for (const id of sel) {
      const world = geometry.bounds_of(id);
      const container = this.container_box(id);
      if (!world || !container) continue;
      world_rects.push(world);
      container_rects.push(container);
    }
    if (world_rects.length === 0) return undefined;

    const world_union = cmath.rect.union(world_rects);
    const container_union = cmath.rect.union(container_rects);
    const cx = container_union.x + container_union.width / 2;
    const by = container_union.y + container_union.height;
    const label = `${cmath.ui.formatNumber(world_union.width, 1)} × ${cmath.ui.formatNumber(world_union.height, 1)}`;
    // Degenerate line — relies on the strict-`<` tie-break in
    // `@grida/hud`'s line-label renderer (canvas.ts ~L205) to place
    // the pill at (cx, by + LABEL_OFFSET). TODO: promote to a proper
    // HUDLabel primitive — see TODO.md §13.
    const lines: HUDLine[] = [
      {
        x1: cx,
        y1: by,
        x2: cx,
        y2: by,
        label,
        color,
        group: SVG_HUD_GROUP.sizeMeter,
      },
    ];
    return { lines };
  }

  /**
   * Thin outline rects for each individually-selected member, drawn
   * inside the single envelope chrome when a multi-selection is active.
   * Lets the user see _what_ is selected separately from _what will
   * resize as a unit_ (the envelope itself, with corner handles).
   *
   * Single-member selections already get their outline from the
   * chrome's own rect renderer — emitting outlines here would be
   * redundant (double-stroked outline). Returns `undefined` then.
   */
  private compute_member_outlines_extra(): HUDDraw | undefined {
    if (this.editor.state.mode === "edit-content") return undefined;
    const sel = this.editor.state.selection;
    if (sel.length < 2) return undefined;
    const color = this.editor.style.chrome_color;
    const rects: HUDRect[] = [];
    for (const id of sel) {
      const r = this.container_box(id);
      if (!r) continue;
      rects.push({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        stroke: true,
        color,
        group: SVG_HUD_GROUP.memberOutline,
      });
    }
    return rects.length > 0 ? { rects } : undefined;
  }

  private compute_snap_extra(): HUDDraw | undefined {
    // Insertion-drag wins when active — it's mutually exclusive with the
    // other gesture types (no translate / resize / nudge-dwell can run
    // while pending_insert is open).
    const insert_guide =
      this.pending_insert?.phase === "drawing"
        ? this.pending_insert.snap_session?.last_guide
        : undefined;
    if (insert_guide) {
      return snapGuideToHUDDraw(
        this.project_guide_to_screen(insert_guide),
        this.editor.style.measurement_color
      );
    }
    // Drag (translate), resize, and nudge-dwell are mutually exclusive
    // by gesture state — at most one of them has active guides. Prefer
    // translate → resize → nudge-dwell.
    const guides =
      this.translate_orchestrator.last_guides.length > 0
        ? this.translate_orchestrator.last_guides
        : this.resize_orchestrator.last_guides.length > 0
          ? this.resize_orchestrator.last_guides
          : this.nudge_dwell_watcher.guides;
    if (guides.length === 0) return undefined;
    // Reuse `measurement_color` for snap guide lines — same red family
    // the main editor uses for snap (`WorkbenchColors.red = #f44336`).
    return snapGuideToHUDDraw(
      this.project_guide_to_screen(guides[0]),
      this.editor.style.measurement_color
    );
  }

  /** Project a snap guide from world space (pipeline output) to screen
   *  CSS-px (the HUD canvas's identity-transform coordinate system).
   *  Lines + points project via `camera.world_to_screen`; rules carry
   *  a single axis-offset, so they project a representative point on
   *  that axis (the camera has no rotation, so per-axis scale +
   *  translate fully describes the projection). */
  private project_guide_to_screen(
    g: import("@grida/cmath/_snap").guide.SnapGuide
  ): import("@grida/cmath/_snap").guide.SnapGuide {
    const cam = this.camera;
    return {
      lines: g.lines.map((l) => {
        const p1 = cam.world_to_screen({ x: l.x1, y: l.y1 });
        const p2 = cam.world_to_screen({ x: l.x2, y: l.y2 });
        return { ...l, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      }),
      points: g.points.map(([x, y]) => {
        const p = cam.world_to_screen({ x, y });
        return [p.x, p.y];
      }),
      rules: g.rules.map(([axis, offset]) => {
        const p = cam.world_to_screen(
          axis === "x" ? { x: offset, y: 0 } : { x: 0, y: offset }
        );
        return [axis, axis === "x" ? p.x : p.y];
      }),
    };
  }

  /** Freeze snap inputs at gesture start: dragged agent rects +
   *  neighbor candidate rects. Both come from `bbox_world_for_snap` →
   *  `bbox_world`, which projects each element's `getBBox()` through
   *  its own `transform=` so the rects sit in **doc space** — the root
   *  SVG's user-coordinate system, with element-local rotations / etc.
   *  already accounted for. The pipeline operates in this same space,
   *  so snap inputs and pipeline deltas share a frame end-to-end.
   *
   *  Returns a fresh `SnapSession`; the caller (orchestrator OR
   *  nudge-dwell watcher) owns its lifetime. */
  private open_snap_session_for(ids: ReadonlyArray<NodeId>): SnapSession {
    const doc = this.editor.document;
    const neighbor_ids = compute_neighborhood(doc, ids);
    // Agent-side descent: a dragged `<g>` exposes its own bbox AND each
    // rendered descendant leaf as snap anchors. Symmetric to the
    // neighborhood walker's group expansion. Non-groups pass through.
    const agent_id_set = new Set<NodeId>();
    for (const id of ids) {
      for (const inner of snap_descent(doc, id)) agent_id_set.add(inner);
    }
    const agents: Rect[] = [];
    for (const id of agent_id_set) {
      const r = this.bbox_world_for_snap(id);
      if (r) agents.push(r);
    }
    const neighbors: Rect[] = [];
    for (const id of neighbor_ids) {
      const r = this.bbox_world_for_snap(id);
      if (r) neighbors.push(r);
    }
    return new SnapSession({ agents, neighbors });
  }

  /** Cancel any in-flight gesture (orchestrator + active_preview). Used
   *  by Escape and the `cancel_gesture` intent. Returns whether anything
   *  was canceled. */
  private cancel_in_flight(): boolean {
    let canceled = false;
    if (this.translate_orchestrator.has_active_session()) {
      this.translate_orchestrator.cancel();
      canceled = true;
    }
    if (this.resize_orchestrator.has_active_session()) {
      this.resize_orchestrator.cancel();
      canceled = true;
    }
    if (this.rotate_orchestrator.has_active_session()) {
      this.rotate_orchestrator.cancel();
      canceled = true;
    }
    if (this.active_preview) {
      this.active_preview.session.discard();
      this.active_preview = null;
      canceled = true;
    }
    if (this.pending_insert) {
      // Only `drawing` has an open preview to discard; `armed` is
      // pre-creation so there's nothing in the IR to roll back.
      if (this.pending_insert.phase === "drawing") {
        this.pending_insert.session.discard();
        this.pending_insert.snap_session?.dispose?.();
      }
      this.pending_insert = null;
      // Tool was set to insert when the gesture started; Escape during
      // any phase reverts to cursor (same end-state as a normal commit).
      this.editor.set_tool({ type: "cursor" });
      canceled = true;
    }
    if (canceled) this.request_redraw();
    return canceled;
  }

  private sync_surface_selection() {
    const state = this.editor.state;
    // In edit-content mode, hide chrome.
    if (state.mode === "edit-content") {
      this.hud.setSelection([]);
      return;
    }
    if (state.selection.length <= 1) {
      // Singleton / empty — use the flat-NodeId overload so the HUD's
      // chrome resolves each member's shape via `shapeOf(id)` at frame
      // build time. That keeps the chrome locked to live container
      // bounds even as the camera pans/zooms, without us needing to
      // republish the selection on every camera tick.
      this.hud.setSelection(state.selection);
      return;
    }
    // Multi-member: one outer envelope across the whole selection. The
    // chrome can't resolve a multi-id union from `shapeOf` (single-id
    // contract), so we precompute the union here. Per-member outlines
    // are emitted separately as decoration extras (see
    // {@link compute_member_outlines_extra}) so the user sees both
    // "what I'll resize as a unit" (the envelope) and "what's selected"
    // (the inner outlines).
    //
    // Camera changes invalidate the precomputed rect — `camera.subscribe`
    // calls back into here so the union re-reads `container_box` against
    // the new CTM.
    this.hud.setSelection(this.build_selection_groups(state.selection));
  }

  /**
   * Build the HUD's `SelectionGroup[]` for a multi-member selection.
   * Singleton selections do NOT go through this helper — see
   * {@link sync_surface_selection} for the policy.
   */
  private build_selection_groups(
    selection: ReadonlyArray<NodeId>
  ): SelectionGroup[] {
    if (selection.length < 2) return [];
    const rects: Rect[] = [];
    for (const id of selection) {
      const r = this.container_box(id);
      if (r) rects.push(r);
    }
    if (rects.length === 0) return [];
    return [
      {
        ids: selection,
        shape: { kind: "rect", rect: cmath.rect.union(rects) },
      },
    ];
  }

  // ─── HUD providers ──────────────────────────────────────────────────────

  /**
   * Return the selection shape for a node. Vector `<line>` nodes return
   * `{ kind: "line", p1, p2 }` so the HUD lays out endpoint knobs; all
   * other nodes return `{ kind: "rect", rect }` using the container-space
   * bounding box.
   */
  private shape_of(id: NodeId): SelectionShape | null {
    const tag = this.tag_of(id);
    if (tag === "line") {
      const line = this.line_endpoints_in_container(id);
      if (line) return { kind: "line", p1: line.p1, p2: line.p2 };
    }

    // Fast path for elements without geometric APIs (or `<svg>` viewports
    // which `container_box` handles specially): fall back to the AABB form.
    const el = this.element_index.get(id);
    if (
      !(el instanceof SVGGraphicsElement) ||
      typeof el.getBBox !== "function" ||
      typeof el.getScreenCTM !== "function" ||
      tag === "svg"
    ) {
      const rect = this.container_box(id);
      return rect ? { kind: "rect", rect } : null;
    }

    let bbox_local: { x: number; y: number; width: number; height: number };
    try {
      const b = el.getBBox();
      bbox_local = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      const rect = this.container_box(id);
      return rect ? { kind: "rect", rect } : null;
    }
    const ctm = el.getScreenCTM();
    if (!ctm) {
      const rect = this.container_box(id);
      return rect ? { kind: "rect", rect } : null;
    }

    // Translate-and-scale-only (`b == 0 && c == 0`) elements stay on the
    // `rect` fast path — chrome rendering is byte-identical to today's
    // AABB output. Any rotation/skew/mirror — b or c nonzero — graduates
    // to `transformed` so the HUD renders rotated outline + knobs +
    // size badge + cursor.
    if (ctm.b === 0 && ctm.c === 0) {
      const rect = this.container_box(id);
      return rect ? { kind: "rect", rect } : null;
    }

    // `getScreenCTM()` maps local → page CSS-px (includes the SVG's CSS
    // camera transform). The HUD draws chrome in container CSS-px space
    // (its own transform is kept at identity here — see
    // `apply_camera_transform`), so subtract the container's screen
    // top-left from `e`/`f` (mirrors `container_box`'s offset math).
    const cr = this.container.getBoundingClientRect();
    const dx = -cr.left + this.container.scrollLeft;
    const dy = -cr.top + this.container.scrollTop;
    return {
      kind: "transformed",
      local: bbox_local,
      matrix: [
        [ctm.a, ctm.c, ctm.e + dx],
        [ctm.b, ctm.d, ctm.f + dy],
      ],
    };
  }

  /**
   * Project an SVG `<line>`'s `x1,y1,x2,y2` from its own coordinate space
   * to the container's coordinate space, where the HUD operates.
   */
  private line_endpoints_in_container(
    id: NodeId
  ): { p1: [number, number]; p2: [number, number] } | null {
    const el = this.element_index.get(id);
    if (!(el instanceof SVGGraphicsElement)) return null;
    if (typeof el.getScreenCTM !== "function") return null;
    const ctm = el.getScreenCTM();
    if (!ctm || !this.svg_root) return null;
    const x1 = parseFloat(el.getAttribute("x1") ?? "0");
    const y1 = parseFloat(el.getAttribute("y1") ?? "0");
    const x2 = parseFloat(el.getAttribute("x2") ?? "0");
    const y2 = parseFloat(el.getAttribute("y2") ?? "0");
    if (!Number.isFinite(x1) || !Number.isFinite(y1)) return null;
    if (!Number.isFinite(x2) || !Number.isFinite(y2)) return null;
    const project = (px: number, py: number): [number, number] => {
      const sx = ctm.a * px + ctm.c * py + ctm.e;
      const sy = ctm.b * px + ctm.d * py + ctm.f;
      return [sx, sy];
    };
    const cr = this.container.getBoundingClientRect();
    const [s1x, s1y] = project(x1, y1);
    const [s2x, s2y] = project(x2, y2);
    return {
      p1: [
        s1x - cr.left + this.container.scrollLeft,
        s1y - cr.top + this.container.scrollTop,
      ],
      p2: [
        s2x - cr.left + this.container.scrollLeft,
        s2y - cr.top + this.container.scrollTop,
      ],
    };
  }

  /** Container-space bounding rect for a node. Callers running a batch
   *  (snap session open, marquee) can pass a pre-read `container_rect`
   *  to avoid the per-call layout flush.
   *
   *  `<svg>` elements (root or nested) establish a viewport (SVG 2 §7.2).
   *  Their visible canvas is the viewport rect, NOT the union of
   *  descendant geometry that `getBBox()` reports (SVG 2 §4.6.4). For
   *  those we read `getBoundingClientRect()` — the CSSOM rendered box
   *  of the `<svg>` element itself, independent of children. Every
   *  other element type still goes through `getBBox` + `getScreenCTM`. */
  private container_box(id: NodeId, container_rect?: DOMRect): Rect | null {
    const el = this.element_index.get(id);
    if (!el) return null;
    const ge = el as SVGGraphicsElement;
    if (
      typeof ge.getBBox !== "function" ||
      typeof ge.getScreenCTM !== "function"
    ) {
      return null;
    }
    const cr = container_rect ?? this.container.getBoundingClientRect();

    // Viewport path: `<svg>` reports descendant union via getBBox, which
    // is the wrong rect for snap/measurement (a child can never escape
    // its parent on the side it defines). The viewport itself is the
    // CSS box of the element.
    if (this.tag_of(id) === "svg") {
      const r = el.getBoundingClientRect();
      return {
        x: r.left - cr.left + this.container.scrollLeft,
        y: r.top - cr.top + this.container.scrollTop,
        width: r.width,
        height: r.height,
      };
    }

    let bbox: Rect;
    try {
      const b = ge.getBBox();
      bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      return null;
    }
    const ctm = ge.getScreenCTM();
    if (!ctm) return null;
    const project = (px: number, py: number) => ({
      x: ctm.a * px + ctm.c * py + ctm.e,
      y: ctm.b * px + ctm.d * py + ctm.f,
    });
    const corners = [
      project(bbox.x, bbox.y),
      project(bbox.x + bbox.width, bbox.y),
      project(bbox.x + bbox.width, bbox.y + bbox.height),
      project(bbox.x, bbox.y + bbox.height),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return {
      x: left - cr.left + this.container.scrollLeft,
      y: top - cr.top + this.container.scrollTop,
      width: right - left,
      height: bottom - top,
    };
  }

  // ─── Pointer events → Surface.dispatch ──────────────────────────────────

  private wire_events() {
    const owner_doc = this.container.ownerDocument;
    const win = owner_doc.defaultView ?? window;
    const on = <E extends Event>(
      target: EventTarget,
      event: string,
      handler: (e: E) => void
    ) => {
      target.addEventListener(event, handler as EventListener);
      this.teardown.push(() =>
        target.removeEventListener(event, handler as EventListener)
      );
    };

    on(this.container, "pointerdown", (e: PointerEvent) =>
      this.dispatch_pointer(e, "pointer_down")
    );
    on(win, "pointermove", (e: PointerEvent) =>
      this.dispatch_pointer(e, "pointer_move")
    );
    on(win, "pointerup", (e: PointerEvent) =>
      this.dispatch_pointer(e, "pointer_up")
    );
    on(owner_doc, "keydown", (e: KeyboardEvent) => this.on_keydown(e));
    // Window-level modifier tracking: forward modifier-state changes to the
    // surface so `surface.modifiers()` stays live without round-tripping
    // through a pointer event. Listening on `win` (not `owner_doc`) catches
    // releases that happen with focus outside the container.
    on(win, "keydown", (e: KeyboardEvent) => {
      if (e.repeat || !IS_MODIFIER_KEY[e.key]) return;
      this.sync_modifiers(e);
    });
    on(win, "keyup", (e: KeyboardEvent) => {
      if (!IS_MODIFIER_KEY[e.key]) return;
      this.sync_modifiers(e);
    });
    on(win, "blur", () => this.sync_modifiers(null));

    // Prevent context menu inside container (we don't have right-click UI yet).
    on(this.container, "contextmenu", (e: MouseEvent) => e.preventDefault());
  }

  /**
   * Master signal for modifier-driven UX consumers (measurement, future
   * constrained-resize, …). Modifier changes aren't on the pointer-event
   * path, so derived overlays would otherwise wait for the next pointer
   * move; redraw eagerly. `null` means modifiers are forced clear
   * (blur / focus-out).
   */
  private sync_modifiers(e: KeyboardEvent | null): void {
    const next: Modifiers = e
      ? {
          shift: e.shiftKey,
          alt: e.altKey,
          meta: e.metaKey,
          ctrl: e.ctrlKey,
        }
      : NO_MODS;
    const prev = this.hud.modifiers();
    if (
      prev.shift === next.shift &&
      prev.alt === next.alt &&
      prev.meta === next.meta &&
      prev.ctrl === next.ctrl
    ) {
      return;
    }
    const response = this.hud.dispatch({ kind: "modifiers", mods: next });
    // Re-run the current preview frame so an in-flight translate reflects
    // the new modifier state without waiting for the next pointer-move.
    if (
      prev.shift !== next.shift &&
      this.translate_orchestrator.has_active_session()
    ) {
      this.translate_orchestrator.redrive_modifiers(
        this.current_translate_modifiers()
      );
    }
    if (
      prev.shift !== next.shift &&
      this.resize_orchestrator.has_active_session()
    ) {
      this.resize_orchestrator.redrive_modifiers(
        this.current_resize_modifiers()
      );
    }
    if (
      prev.shift !== next.shift &&
      this.rotate_orchestrator.has_active_session()
    ) {
      this.rotate_orchestrator.redrive_modifiers(
        this.current_rotate_modifiers()
      );
    }
    this.redraw();
    if (response.cursorChanged) this.sync_cursor();
    if (response.hoverChanged) {
      this.editor_hover_internal?.push_surface_hover(this.hud.hover());
    }
  }

  private dispatch_pointer(
    e: PointerEvent,
    kind: "pointer_down" | "pointer_move" | "pointer_up"
  ): void {
    if (this.text_edit) {
      const target_el = this.text_edit_target
        ? this.element_index.get(this.text_edit_target)
        : null;
      const over_target =
        !!target_el &&
        e.target instanceof Element &&
        (e.target === target_el || target_el.contains(e.target));
      // `preventDefault()` keeps the hidden input focused — without it, the
      // browser's default focus shift triggers a deferred onBlur → commit.
      if (kind === "pointer_down") {
        e.preventDefault();
        if (over_target) {
          this.text_edit.pointerDown(e.clientX, e.clientY, e.shiftKey);
        } else {
          this.text_edit.commit();
        }
      } else if (kind === "pointer_move") {
        this.text_edit.pointerMove(e.clientX, e.clientY);
        this.container.style.cursor = over_target ? "text" : "default";
      } else if (kind === "pointer_up") {
        this.text_edit.pointerUp();
      }
      return;
    }

    const cr = this.container.getBoundingClientRect();
    const x = e.clientX - cr.left;
    const y = e.clientY - cr.top;
    // Track separately from HUD hover so the Alt-measurement HUD can
    // re-hit-test with the `<svg>` root allowed as a candidate. Mutated
    // in place to avoid per-pointer-move allocation.
    this.last_pointer.x = x;
    this.last_pointer.y = y;
    this.last_pointer_valid = true;
    const mods: Modifiers = {
      shift: e.shiftKey,
      alt: e.altKey,
      meta: e.metaKey,
      ctrl: e.ctrlKey,
    };

    // Insert tool intercept — runs BEFORE the HUD's selection / marquee
    // routing so pointer-down on the canvas starts an insertion gesture
    // instead of selecting whatever's under the pointer.
    //
    // **Critical button gating**: `PointerEvent.button` semantics differ
    // by event type — pointerdown/pointerup carry the button index (0 =
    // primary), but **pointermove carries `-1`** (no button event
    // triggered the move). Gating the entire branch on `e.button === 0`
    // would skip pointermove and hand it to the HUD, breaking drag-to-
    // draw. Gate per-event-kind instead.
    const tool = this.current_tool;
    if (tool.type === "insert") {
      if (kind === "pointer_down") {
        if (e.button === 0) {
          try {
            this.container.setPointerCapture(e.pointerId);
          } catch {
            // Capture failure is non-fatal.
          }
          this.start_insert_gesture(tool.tag, { x, y });
          return;
        }
        // Non-primary down (right-click, middle-mouse): fall through to
        // HUD so pan / context-menu still work during tool mode.
      } else if (this.pending_insert) {
        if (kind === "pointer_move") {
          this.update_insert_gesture({ x, y }, mods);
          return;
        }
        if (kind === "pointer_up" && e.button === 0) {
          this.commit_insert_gesture({ x, y }, mods);
          return;
        }
      }
      // No active gesture and event isn't a primary pointer-down — let
      // the HUD process it (hover during tool mode is fine).
    }

    const button: PointerButton =
      e.button === 0 ? "primary" : e.button === 2 ? "secondary" : "middle";

    let event: SurfaceEvent;
    if (kind === "pointer_move") {
      event = { kind, x, y, mods };
    } else {
      event = { kind, x, y, button, mods };
    }
    // Capture only when a gesture actually starts. Capturing on every
    // primary pointerdown silently broke clicks on any chrome the host
    // accidentally nested inside the container — capture redirects
    // pointerup off the button, so no click is synthesized. The HUD's
    // gesture-kind flip is the truthful "something started" signal,
    // and the flip can happen on either pointer_down (immediate-start
    // gestures like endpoint grab) or pointer_move (pending → marquee /
    // translate promotion after drag threshold).
    const gesture_before_kind =
      kind === "pointer_up" ? null : this.hud.gesture().kind;
    const response = this.hud.dispatch(event);
    if (gesture_before_kind === "idle" && this.hud.gesture().kind !== "idle") {
      try {
        this.container.setPointerCapture(e.pointerId);
      } catch {
        // Some hosts disallow capture; safe to ignore.
      }
    }
    if (response.needsRedraw) this.redraw();
    if (response.cursorChanged) this.sync_cursor();
    if (response.hoverChanged) {
      this.editor_hover_internal?.push_surface_hover(this.hud.hover());
    }
  }

  /** Drag threshold in CSS px (squared, to avoid sqrt on the pointer hot
   *  path). Below this distance²-from-anchor, pointer-up commits a
   *  click-no-drag insert (one-shot `commands.insert`); at or above, the
   *  pointer is "drawing" and we open a preview session. */
  private static readonly INSERT_DRAG_THRESHOLD_PX_SQ = 2 * 2;

  /** Arm an insertion gesture on pointer-down. No IR mutation — keeping
   *  the IR pristine through the click window lets click-no-drag commit
   *  as one atomic `commands.insert` rather than create-zero-then-resize. */
  private start_insert_gesture(tag: InsertableTag, screen_pt: Vec2): void {
    this.pending_insert = {
      phase: "armed",
      tag,
      anchor: this.camera.screen_to_world(screen_pt),
      anchor_screen: { x: screen_pt.x, y: screen_pt.y },
    };
  }

  /** Per-frame update. `armed` waits for the drag threshold; `drawing`
   *  pushes a frame through the preview session. */
  private update_insert_gesture(screen_pt: Vec2, mods: Modifiers): void {
    const cur = this.pending_insert;
    if (!cur) return;
    if (cur.phase === "armed") {
      const dx = screen_pt.x - cur.anchor_screen.x;
      const dy = screen_pt.y - cur.anchor_screen.y;
      if (dx * dx + dy * dy < DomSurface.INSERT_DRAG_THRESHOLD_PX_SQ) return;
      this.arm_to_draw(cur);
    }
    const live = this.pending_insert;
    if (live?.phase !== "drawing") return;
    this.push_drawing_frame(live, screen_pt, mods);
  }

  /** Transition `armed` → `drawing`: open `insert_preview` + snap session. */
  private arm_to_draw(armed: PendingInsertCommon & { phase: "armed" }): void {
    const session = this.editor.commands.insert_preview(
      armed.tag,
      initial_attrs(armed.tag, armed.anchor)
    );
    // Snap is rect-shaped — `<line>` insert-drag uses an endpoint-style
    // model that isn't wired yet (see TODO.md).
    const snap_session =
      this.editor.style.snap_enabled &&
      (armed.tag === "rect" || armed.tag === "ellipse")
        ? this.open_snap_session_for([session.id])
        : null;
    this.pending_insert = {
      phase: "drawing",
      tag: armed.tag,
      anchor: armed.anchor,
      anchor_screen: armed.anchor_screen,
      session,
      snap_session,
    };
  }

  /** Push one drag frame through the preview session. */
  private push_drawing_frame(
    drawing: PendingInsertCommon & {
      phase: "drawing";
      session: InsertPreviewSession;
      snap_session: SnapSession | null;
    },
    screen_pt: Vec2,
    mods: Modifiers
  ): void {
    let world = this.camera.screen_to_world(screen_pt);
    if (drawing.snap_session) {
      const corrected = this.snap_insert_point(
        drawing.tag,
        drawing.anchor,
        drawing.anchor_screen,
        world,
        drawing.snap_session
      );
      if (corrected) world = corrected;
    }
    const dm: DragModifiers = { shift: mods.shift, alt: mods.alt };
    drawing.session.update(
      compute_drag_attrs(drawing.tag, drawing.anchor, world, dm)
    );
  }

  /** Commit on pointer-up. `armed` → one-shot `commands.insert` with
   *  `default_attrs` (click-no-drag, never touches the IR mid-gesture).
   *  `drawing` → push final frame + close the preview. */
  private commit_insert_gesture(screen_pt: Vec2, mods: Modifiers): void {
    const cur = this.pending_insert;
    if (!cur) return;
    if (cur.phase === "armed") {
      this.editor.commands.insert(cur.tag, default_attrs(cur.tag, cur.anchor));
    } else {
      this.push_drawing_frame(cur, screen_pt, mods);
      cur.session.commit();
      cur.snap_session?.dispose?.();
    }
    this.pending_insert = null;
    this.editor.set_tool({ type: "cursor" });
  }

  /** Snap the in-progress insert's moving corner to neighbor geometry.
   *  Returns a corrected world-space pointer, or `null` to leave the
   *  input uncorrected. Operates in container CSS-px (the snap engine's
   *  native space) and projects the correction back to world via
   *  `camera.zoom`. Rect / ellipse only. */
  private snap_insert_point(
    tag: InsertableTag,
    anchor: Vec2,
    anchor_screen: Vec2,
    current: Vec2,
    snap_session: SnapSession
  ): Vec2 | null {
    if (tag !== "rect" && tag !== "ellipse") return null;
    const zoom = this.camera.zoom;
    if (zoom <= 0) return null;
    if (current.x === anchor.x && current.y === anchor.y) return null;
    // Build the effective rect directly in container space — anchor is
    // cached, current we project once.
    const current_screen = this.camera.world_to_screen(current);
    const x = Math.min(anchor_screen.x, current_screen.x);
    const y = Math.min(anchor_screen.y, current_screen.y);
    const effective: Rect = {
      x,
      y,
      width: Math.abs(current_screen.x - anchor_screen.x),
      height: Math.abs(current_screen.y - anchor_screen.y),
    };
    const edges_x: "left" | "right" | null =
      current.x === anchor.x ? null : current.x > anchor.x ? "right" : "left";
    const edges_y: "top" | "bottom" | null =
      current.y === anchor.y ? null : current.y > anchor.y ? "bottom" : "top";
    const opts = {
      enabled: this.editor.style.snap_enabled,
      threshold_px: this.editor.style.snap_threshold_px,
    };
    const result = snap_session.snap_resize(
      effective,
      { x: edges_x, y: edges_y },
      opts
    );
    if (result.dx === 0 && result.dy === 0) return current;
    // Apply correction back in world space.
    return {
      x: current.x + result.dx / zoom,
      y: current.y + result.dy / zoom,
    };
  }

  private sync_cursor(): void {
    // In text-edit mode the HUD is bypassed for pointer events (see
    // `dispatch_pointer`), so the cursor is resolved there on each
    // pointer_move based on whether the pointer is over the edit target.
    // Here we just reset to default on enter/exit so a stale "move" from
    // the prior translate-body hover doesn't persist.
    if (this.text_edit) {
      this.container.style.cursor = "default";
      return;
    }
    // Insert tool wins over HUD-derived cursor — the HUD knows nothing
    // about the tool axis, so without this branch a hover over an
    // existing node would flip to "move" / "resize-*" while the user is
    // trying to draw a new shape.
    if (this.current_tool.type === "insert") {
      this.container.style.cursor = "crosshair";
      return;
    }
    // Delegate icon → CSS to the HUD's installed renderer. The
    // `@grida/hud/cursors` default renderer (installed at construction)
    // emits SVG cursors for rotate / resize variants and passes through
    // native CSS keywords for everything else. To opt out of the
    // bundled renderer, swap to `this.hud.setCursorRenderer(null)`.
    this.container.style.cursor = this.hud.cursorCss();
  }

  private on_keydown(e: KeyboardEvent) {
    if (this.text_edit) return;

    // Host-specific concern: Escape cancels any in-flight preview
    // regardless of whether the keymap consumes the event. Run before
    // dispatch so a "deselect when nothing is selected" no-op doesn't
    // swallow the preview cancel.
    if (e.code === "Escape") this.cancel_in_flight();

    // A non-Escape key fired mid-gesture would land its history step
    // between the open preview session and its eventual commit, breaking
    // undo order. Drop it. Modifiers still flow through the window-level
    // listener that drives `surface.modifiers()`.
    const in_gesture =
      this.active_preview ||
      this.translate_orchestrator.has_active_session() ||
      this.resize_orchestrator.has_active_session() ||
      this.rotate_orchestrator.has_active_session() ||
      this.pending_insert;
    if (in_gesture && e.code !== "Escape") return;

    // All other keyboard routing lives in the editor's keymap. Adding a
    // new built-in shortcut = add a row to `keymap/defaults.ts`; adding
    // a new handler = add it to `commands/defaults.ts`. Nothing host-
    // specific goes here.
    //
    // Swallow the browser default whenever the keymap CLAIMS this key
    // combo — not just when a handler consumed. If we advertise Cmd+G
    // as "group selection", the browser's find bar must not open even
    // when the group command's policy rejects (e.g. empty selection).
    // The keymap is the source of truth for "is this advertised"; the
    // host owns preventDefault because only it sees the DOM event.
    if (this.editor.keymap.claims(e)) e.preventDefault();
    this.editor.keymap.dispatch(e);
  }

  // ─── Intent handler ──────────────────────────────────────────────────────

  private commit_intent(intent: Intent): void {
    switch (intent.kind) {
      case "select": {
        this.editor.commands.select(intent.ids, { mode: intent.mode });
        return;
      }
      case "deselect_all": {
        this.editor.commands.deselect();
        return;
      }
      case "translate": {
        this.handle_translate(intent);
        return;
      }
      case "resize": {
        this.handle_resize(intent);
        return;
      }
      case "rotate": {
        this.handle_rotate(intent);
        return;
      }
      case "marquee_select": {
        this.handle_marquee(intent);
        return;
      }
      case "set_endpoint": {
        this.handle_set_endpoint(intent);
        return;
      }
      case "enter_content_edit": {
        this.editor.commands.select(intent.id);
        this.editor.enter_content_edit(intent.id);
        return;
      }
      case "cancel_gesture": {
        this.cancel_in_flight();
        return;
      }
    }
  }

  private handle_translate(intent: Intent & { kind: "translate" }): void {
    if (intent.ids.length === 0) return;
    // Convert CSS-pixel cursor delta → world delta at the intent
    // boundary. The pipeline (axis-lock → snap → pixel-grid) operates
    // in world space; the orchestrator writes attributes directly
    // without an unproject step. For flat documents (the editor's
    // design target) world ≡ each element's own-frame.
    const zoom = this.camera.zoom || 1;
    const dx_world = intent.dx / zoom;
    const dy_world = intent.dy / zoom;
    this.translate_orchestrator.drive(
      { ids: intent.ids, movement: [dx_world, dy_world] },
      this.current_translate_modifiers(),
      { phase: intent.phase, policy: "engine", snap: true }
    );
    if (intent.phase === "commit") this.request_redraw();
  }

  /** Snapshot of HUD modifier state mapped to pipeline `TranslateModifiers`.
   *  Pull-at-consume: HUD is the canonical store (see `sync_modifiers`),
   *  read live so mid-drag Shift press/release reflects on the next pass. */
  private current_translate_modifiers(): TranslateModifiers {
    return {
      axis_lock: this.hud.modifiers().shift ? "by_dominance" : "off",
      force_disable_snap: false,
    };
  }

  /** Snapshot of HUD modifier state mapped to `ResizeModifiers`. Same
   *  pull-at-consume discipline as `current_translate_modifiers`. */
  private current_resize_modifiers(): ResizeModifiers {
    return {
      aspect_lock: this.hud.modifiers().shift ? "uniform" : "off",
      force_disable_snap: false,
    };
  }

  private handle_resize(intent: Intent & { kind: "resize" }): void {
    // Multi-member groups: the HUD passes the group's member ids in
    // `intent.ids`. The orchestrator captures per-member baselines and
    // applies one shared `(sx, sy, origin)` to each. Single-member is a
    // 1-length array — same code path. Reject the gesture if any member
    // tag is non-resizable (e.g. `<g>`); the orchestrator does this
    // again internally, but bailing early avoids a wasted bbox read.
    if (intent.ids.length === 0) return;
    for (const id of intent.ids) {
      if (!is_resizable_node(this.editor.document, id)) return;
    }
    const dir = intent.anchor;

    // Two paths:
    // - `intent.shape?.kind === "transformed"` → resize ran in the
    //   selection's local frame. `local.width/height` are the artwork's
    //   intrinsic dims (already in element-coordinate space — no zoom
    //   division). The orchestrator writes those dims back while the
    //   element's `transform=` attribute is left untouched, so the
    //   artwork grows along its rotation axis.
    // - Otherwise → HUD streams an AABB in CSS pixels (legacy axis-
    //   aligned path). Divide by camera zoom to get world dims.
    let target_width: number;
    let target_height: number;
    if (intent.shape && intent.shape.kind === "transformed") {
      target_width = intent.shape.local.width;
      target_height = intent.shape.local.height;
    } else {
      const zoom = this.camera.zoom || 1;
      target_width = intent.rect.width / zoom;
      target_height = intent.rect.height / zoom;
    }
    this.resize_orchestrator.drive(
      {
        ids: intent.ids,
        direction: dir,
        target_width,
        target_height,
      },
      this.current_resize_modifiers(),
      {
        phase: intent.phase === "commit" ? "commit" : "preview",
        snap: true,
      }
    );
    if (intent.phase === "commit") this.request_redraw();
  }

  /** Snapshot of HUD modifier state mapped to `RotateModifiers`. Same
   *  pull-at-consume discipline as the translate / resize equivalents. */
  private current_rotate_modifiers(): RotateModifiers {
    return {
      angle_snap: this.hud.modifiers().shift ? "step" : "off",
      force_disable_snap: false,
    };
  }

  private handle_rotate(intent: Intent & { kind: "rotate" }): void {
    if (intent.ids.length === 0) return;
    const result = this.rotate_orchestrator.drive(
      { ids: intent.ids, angle_radians: intent.angle },
      this.current_rotate_modifiers(),
      { phase: intent.phase === "commit" ? "commit" : "preview" }
    );
    // On commit, the orchestrator reports either `committed` or `refused`.
    // Refusals: emit a one-shot toast describing the reason. Each reason
    // is one of `is_rotatable`'s discriminators; the message text mirrors
    // the README's surfaced-warnings list.
    if (result && result.outcome && result.outcome.kind === "refused") {
      this.emit_rotate_refusal(result.outcome.verdicts);
    }
    if (intent.phase === "commit") this.request_redraw();
  }

  /** Map each refusal verdict to a user-facing chip message. v1 fires
   *  one toast for the first refusal encountered — the user can address
   *  it and try again. Refusal verdicts come straight from
   *  `is_rotatable`. */
  private emit_rotate_refusal(
    verdicts: ReadonlyMap<NodeId, RotatableVerdict>
  ): void {
    for (const v of verdicts.values()) {
      if (v.kind !== "refuse") continue;
      const message =
        v.reason === "non-trivial-transform"
          ? "Cannot rotate cleanly — element has a composite transform. Use Flatten Transform first."
          : v.reason === "text-with-glyph-rotate"
            ? "Cannot rotate — text has per-glyph rotation. Edit `rotate=` or remove it first."
            : v.reason === "css-property-transform"
              ? "Cannot rotate — transform is set via CSS. Move the declaration to the `transform` attribute first."
              : "Cannot rotate — element has an animated transform. Remove `<animateTransform>` first.";
      // The HUD surface accepts a one-shot toast via `setTransientToast`.
      // If the API isn't wired in some host, console.warn is the
      // documented fallback.
      const hud = this.hud as unknown as {
        setTransientToast?: (m: string) => void;
      };
      if (typeof hud.setTransientToast === "function") {
        hud.setTransientToast(message);
      } else {
        // eslint-disable-next-line no-console
        console.warn(`[svg-editor] ${message}`);
      }
      return;
    }
  }

  /**
   * Apply a `set_endpoint` intent — moving one endpoint of a vector
   * `<line>` to a new container-space position. Unprojects to the element's
   * own (SVG) coord space and updates the corresponding attribute.
   */
  private handle_set_endpoint(intent: Intent & { kind: "set_endpoint" }): void {
    const id = intent.id;
    if (this.tag_of(id) !== "line") return;
    const internal = this.editor_internal();
    const doc = internal.doc;
    const emit = internal.emit;

    if (
      !this.active_preview ||
      this.active_preview.kind !== "endpoint" ||
      this.active_preview.id !== id ||
      this.active_preview.endpoint !== intent.endpoint
    ) {
      if (this.active_preview) this.active_preview.session.discard();
      const initial = {
        x1: numAttr(doc, id, "x1"),
        y1: numAttr(doc, id, "y1"),
        x2: numAttr(doc, id, "x2"),
        y2: numAttr(doc, id, "y2"),
      };
      this.active_preview = {
        kind: "endpoint",
        id,
        endpoint: intent.endpoint,
        initial,
        session: internal.history.preview("set-endpoint"),
      };
    }
    const initial = this.active_preview.initial;
    const endpoint = this.active_preview.endpoint;

    // Convert intent.pos (container-space) into own-frame (SVG-local) coords
    // by inverting the live CTM at the time of this preview frame.
    const pos_own = this.container_point_in_own_frame(
      id,
      intent.pos[0],
      intent.pos[1]
    );
    if (!pos_own) return;

    const target_x = pos_own.x;
    const target_y = pos_own.y;

    const apply = () => {
      if (endpoint === "p1") {
        doc.set_attr(id, "x1", String(target_x));
        doc.set_attr(id, "y1", String(target_y));
      } else {
        doc.set_attr(id, "x2", String(target_x));
        doc.set_attr(id, "y2", String(target_y));
      }
      emit();
    };
    const revert = () => {
      doc.set_attr(id, "x1", String(initial.x1));
      doc.set_attr(id, "y1", String(initial.y1));
      doc.set_attr(id, "x2", String(initial.x2));
      doc.set_attr(id, "y2", String(initial.y2));
      emit();
    };

    this.active_preview.session.set({
      providerId: "svg-editor",
      apply,
      revert,
    });
    if (intent.phase === "commit") {
      this.active_preview.session.commit();
      this.active_preview = null;
    }
  }

  /**
   * Convert a container-space point to the element's own SVG coord space.
   * Inverse of `line_endpoints_in_container`'s projection.
   */
  private container_point_in_own_frame(
    id: NodeId,
    cx: number,
    cy: number
  ): Vec2 | null {
    const el = this.element_index.get(id);
    if (!(el instanceof SVGGraphicsElement)) return null;
    if (typeof el.getScreenCTM !== "function") return null;
    const ctm = el.getScreenCTM();
    if (!ctm || !this.svg_root) return null;
    const cr = this.container.getBoundingClientRect();
    const inv = ctm.inverse();
    const p = this.svg_root.createSVGPoint();
    p.x = cx + cr.left - this.container.scrollLeft;
    p.y = cy + cr.top - this.container.scrollTop;
    const t = p.matrixTransform(inv);
    return { x: t.x, y: t.y };
  }

  private handle_marquee(intent: Intent & { kind: "marquee_select" }): void {
    if (intent.phase !== "commit") return;
    const ids: NodeId[] = [];
    for (const id of this.element_index.keys()) {
      if (id === this.editor.tree().root) continue;
      const box = this.container_box(id);
      if (!box) continue;
      if (cmath.rect.intersects(box, intent.rect)) ids.push(id);
    }
    if (ids.length === 0) {
      if (!intent.additive) this.editor.commands.deselect();
      return;
    }
    this.editor.commands.select(ids, {
      mode: intent.additive ? "add" : "replace",
    });
  }

  // ─── Content edit (text) ──────────────────────────────────────────────────

  private enter_content_edit(id: NodeId): boolean {
    if (this.text_edit) return false;
    const el = this.element_index.get(id);
    if (!(el instanceof SVGElement)) return false;
    const editor = this.editor;
    const doc = (
      editor as unknown as {
        _internal: {
          doc: import("./core/document").SvgDocument;
          emit: () => void;
        };
      }
    )._internal;
    // Editor already gated on `is_text_edit_target`; here we only assert the
    // dom-side prerequisite — a real text-content element to drive.
    if (!(el instanceof SVGTextContentElement)) return false;

    this.text_edit_target = id;
    this.text_edit_original = doc.doc.text_of(id);
    this.text_edit = TEXT_EDIT_PENDING as unknown as TextEditor;
    this.editor.commands.set_mode("edit-content");
    this.sync_surface_selection();
    this.sync_cursor();
    this.redraw();

    const live_el =
      (this.element_index.get(id) as SVGTextContentElement | undefined) ?? el;
    const text_surface = new SvgTextSurface(live_el);
    const is_mac =
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);

    let settled = false;
    const cleanup_after_commit_or_cancel = () => {
      // P4 — observers should see a consistent post-edit state. Do all
      // observable mutations + surface syncs first; clear the
      // text-edit handles last so anything that polls "is text-edit
      // active?" still says yes until the rest of the world is settled.
      this.editor.commands.set_mode("select");
      this.render();
      this.sync_surface_selection();
      this.sync_cursor();
      this.redraw();
      this.text_edit = null;
      this.text_edit_target = null;
    };

    this.text_edit = createTextEditor({
      container: this.container,
      initialText: this.text_edit_original,
      layout: text_surface,
      surface: text_surface,
      isMac: is_mac,
      ariaLabel: "edit svg text",
      requiresMutationsForCommit: (text) => /\s{2,}|^\s|\s$/.test(text),
      callbacks: {
        onChange: (text) => {
          doc.doc.set_text(id, text);
        },
        onCommit: (final_text) => {
          if (settled) return;
          settled = true;
          doc.doc.set_text(id, this.text_edit_original);
          cleanup_after_commit_or_cancel();
          if (final_text !== this.text_edit_original) {
            this.editor.commands.set_text(final_text);
          }
        },
        onCancel: () => {
          if (settled) return;
          settled = true;
          doc.doc.set_text(id, this.text_edit_original);
          cleanup_after_commit_or_cancel();
          doc.emit();
        },
        onUndoFallthrough: () => {
          this.text_edit?.commit();
          this.editor.commands.undo();
        },
        onRedoFallthrough: () => {
          this.text_edit?.commit();
          this.editor.commands.redo();
        },
      },
    });
    return true;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private tag_of(id: NodeId): string {
    return this.editor.tree().nodes.get(id)?.tag ?? "";
  }

  private bbox_local(id: NodeId): Rect | null {
    const el = this.element_index.get(id);
    if (!el) return null;
    const ge = el as SVGGraphicsElement;
    if (typeof ge.getBBox !== "function") return null;
    try {
      const b = ge.getBBox();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      return null;
    }
  }

  /** Doc-space AABB of `id`'s rendered geometry — local box projected
   *  through the element's own `transform=`. This is the rect snap,
   *  resize-baseline, and rotate-pivot consumers want: where the user
   *  actually sees the element in the root SVG's user-coordinate system.
   *
   *  Flat-doc design target: ancestor transforms (`<g transform=...>`)
   *  are out of scope; only the element's own transform is projected.
   *  `getBBox` (called via `bbox_local`) ignores the element's transform
   *  per SVG 2 §4.6.4, so the projection here is what bridges the gap. */
  private bbox_world(id: NodeId): Rect | null {
    const local = this.bbox_local(id);
    if (!local) return null;
    const transform = this.editor.document.get_attr(id, "transform");
    return project_local_bbox(local, transform);
  }

  /** World-space rect for snap purposes. Differs from `bbox_world` for
   *  `<svg>` viewport-establishing elements: `getBBox()` on an `<svg>`
   *  reports the union of descendant geometry (SVG 2 §4.6.4), which —
   *  when the dragged element is a descendant — silently turns the
   *  dragged element's own pre-gesture position into a snap target via
   *  the parent's edges. Use the viewport extent instead so the root
   *  SVG's snap edges represent the canvas boundary, not "wherever the
   *  children happen to be right now". */
  private bbox_world_for_snap(id: NodeId): Rect | null {
    if (this.tag_of(id) === "svg") {
      const el = this.element_index.get(id);
      if (el instanceof SVGSVGElement) {
        const vp = svg_viewport_bounds(el);
        if (vp) return vp;
      }
    }
    return this.bbox_world(id);
  }

  private editor_internal() {
    return (
      this.editor as unknown as {
        _internal: {
          doc: import("./core/document").SvgDocument;
          history: { preview: (label: string) => Preview };
          emit: () => void;
          subscribe_translate_commit: (cb: () => void) => () => void;
        };
      }
    )._internal;
  }
}

// ────────────────────────────────────────────────────────────────────────────

function numAttr(
  doc: import("./core/document").SvgDocument,
  id: NodeId,
  name: string
): number {
  return svg_parse.parse_number(doc.get_attr(id, name));
}

/** World-space viewport rect of an `<svg>` element. Prefers `viewBox`
 *  (the declared user-space rect — what the user perceives as canvas),
 *  falls back to `width`/`height` at (0,0). For nested `<svg>` with a
 *  positional `x`/`y`, the declared viewBox/(0,0) is in the nested
 *  element's OWN user space; callers are responsible for CTM
 *  projection if a different frame is desired. v1 nested-svg story is
 *  documented in docs/wg/feat-svg-editor/geometry.md as out of scope. */
function svg_viewport_bounds(el: SVGSVGElement): Rect | null {
  const vb = el.getAttribute("viewBox");
  if (vb) {
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const w = parseFloat(el.getAttribute("width") ?? "");
  const h = parseFloat(el.getAttribute("height") ?? "");
  if (Number.isFinite(w) && Number.isFinite(h)) {
    return { x: 0, y: 0, width: w, height: h };
  }
  return null;
}

/** Index of the next side ≥ `start` (in [top, right, bottom, left] order)
 *  where both measurements have a positive distance — i.e. the next side
 *  that `measurementToHUDDraw` would emit a labelled line for. -1 if
 *  none. */
/** Among the edges of a point sequence, pick the one whose outward
 *  normal points most downward — i.e. which edge visually FORMS the
 *  bottom of the shape. For a CW-wound polygon (TL/TR/BR/BL, in y-down
 *  screen space) the outward normal of an edge `(p1, p2)` is the edge
 *  direction rotated 90° CW: `(dy, -dx)`, so the normal's Y component
 *  equals `-dx / |edge|`. Ranking by *normalized* outward-Y, not by
 *  midpoint-Y, makes a long-thin rotated rect anchor the label on its
 *  long bottom edge (correct) instead of the short bottom corner
 *  (which happens to have a lower midpoint but doesn't read as "the
 *  bottom side"). Returns the midpoint as `anchor` and the edge's
 *  direction angle normalized to `(-π/2, π/2]` — so a HUDLine label
 *  drawn at the anchor with `labelAngle = angle` reads right-side-up
 *  and its perpendicular offset points further down.
 *
 *  - `closed = true`: pts are polygon vertices, all consecutive pairs
 *    (incl. last→first) are edges. Use for rects (4 corners → 4 edges).
 *  - `closed = false`: only consecutive pairs in order are edges. Use
 *    for lines (2 endpoints → 1 edge). With a single edge there's no
 *    "outward" to rank — the function just returns the midpoint and
 *    normalized angle. */
function pick_lowest_side_anchor(
  pts: ReadonlyArray<[number, number]>,
  closed: boolean
): { anchor: [number, number]; angle: number } {
  const edge_count = closed ? pts.length : pts.length - 1;
  let best_score = -Infinity;
  let best: { anchor: [number, number]; angle: number } | null = null;
  for (let i = 0; i < edge_count; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.hypot(dx, dy) || 1;
    // Outward-normal Y for CW winding in y-down screen = -dx / len.
    // Higher score = edge faces more downward on screen.
    const score = -dx / len;
    if (score > best_score) {
      best_score = score;
      let theta = Math.atan2(dy, dx);
      if (theta > Math.PI / 2) theta -= Math.PI;
      else if (theta <= -Math.PI / 2) theta += Math.PI;
      best = {
        anchor: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
        angle: theta,
      };
    }
  }
  return best!;
}

function next_labellable_side(
  start: number,
  a: Measurement,
  b: Measurement
): number {
  for (let i = start; i < 4; i++) {
    if (a.distance[i] > 0 && b.distance[i] > 0) return i;
  }
  return -1;
}

/** Concatenate the primitive arrays of N `HUDDraw`s. `undefined` inputs
 *  collapse cleanly so callers can pass per-feature builders without
 *  null-guarding each one. */
function merge_hud_draws(
  ...draws: Array<HUDDraw | undefined>
): HUDDraw | undefined {
  const present = draws.filter((d): d is HUDDraw => d !== undefined);
  if (present.length === 0) return undefined;
  if (present.length === 1) return present[0];
  const out: HUDDraw = {};
  for (const d of present) {
    if (d.lines) (out.lines ??= []).push(...d.lines);
    if (d.rects) (out.rects ??= []).push(...d.rects);
    if (d.rules) (out.rules ??= []).push(...d.rules);
    if (d.points) (out.points ??= []).push(...d.points);
    if (d.polylines) (out.polylines ??= []).push(...d.polylines);
    if (d.screenRects) (out.screenRects ??= []).push(...d.screenRects);
  }
  return out;
}

// ─── Geometry driver (SVG-native, world-space) ─────────────────────────────
//
// Invariants:
// - Camera applies as a CSS transform on the SVG root only. SVG-internal
//   content is never camera-transformed. Therefore `getBBox()` and
//   `getCTM()` (NOT `getScreenCTM`) return world-space (un-zoomed)
//   coordinates regardless of camera state. No reverse-scaling.
// - Camera is uniform-scale + translate. Rotation would break the
//   "screen rect / zoom = world rect" identity but only matters for
//   surface-internal screen-space helpers — bounds_of always reads
//   world directly.
// - Nested `<svg>` is NOT handled in v1. `getCTM()` returns local→
//   *nearest* viewport; a descendant of an inner `<svg>` returns
//   coordinates in the inner-svg space, not the document root. See
//   docs/wg/feat-svg-editor/geometry.md.
// - Text bbox is font-dependent. Bounds may shift after a font-load
//   completes. Documented in docs/wg/feat-svg-editor/geometry.md.

type GeometryAccessors = {
  element_for(id: NodeId): SVGElement | null;
  root(): SVGSVGElement | null;
  camera(): Camera;
  container(): HTMLElement;
  /** World-space picker. Provided by the surface so `SvgGeometryDriver`
   *  can route the elementFromPoint fast-path plus the cmath fat-hit
   *  fallback through one shared implementation. `allow_root` mirrors
   *  the surface-internal `pick_at` flag — see comment there. */
  pick_at_world(p: Vec2, allow_root: boolean): NodeId | null;
};

class SvgGeometryDriver implements GeometryProvider {
  constructor(private readonly accessors: GeometryAccessors) {}

  bounds_of(id: NodeId): Rect | null {
    const el = this.accessors.element_for(id);
    if (!el) return null;

    // `<svg>` establishes a viewport (SVG 2 §7.2). Its world-space
    // bounds are the declared viewBox / width / height — NOT the
    // descendant union that `getBBox()` returns. Without this branch,
    // selecting the root <svg> reports bounds that follow whichever
    // child is currently outermost (e.g. 220×60 for the simple
    // two-rect fixture instead of the declared 400×240). Same spec
    // basis as the `<svg>` branch in `container_box` (CSSOM viewport).
    if (el instanceof SVGSVGElement) {
      return svg_viewport_bounds(el);
    }

    const ge = el as SVGGraphicsElement;
    if (typeof ge.getBBox !== "function" || typeof ge.getCTM !== "function") {
      return null;
    }
    let bbox: { x: number; y: number; width: number; height: number };
    try {
      const b = ge.getBBox();
      bbox = { x: b.x, y: b.y, width: b.width, height: b.height };
    } catch {
      return null;
    }
    const ctm = ge.getCTM();
    if (!ctm) return bbox;
    // TODO: nested-svg — getCTM stops at the nearest viewport. For a
    // descendant of an inner `<svg>`, we'd need to walk
    // `el.ownerSVGElement` and compose matrices up to `this.root()`.
    const project = (px: number, py: number) => ({
      x: ctm.a * px + ctm.c * py + ctm.e,
      y: ctm.b * px + ctm.d * py + ctm.f,
    });
    const corners = [
      project(bbox.x, bbox.y),
      project(bbox.x + bbox.width, bbox.y),
      project(bbox.x + bbox.width, bbox.y + bbox.height),
      project(bbox.x, bbox.y + bbox.height),
    ];
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  bounds_of_many(ids: ReadonlyArray<NodeId>): Map<NodeId, Rect> {
    const out = new Map<NodeId, Rect>();
    for (const id of ids) {
      const r = this.bounds_of(id);
      if (r) out.set(id, r);
    }
    return out;
  }

  nodes_in_rect(rect: Rect): NodeId[] {
    const root = this.accessors.root();
    if (!root) return [];
    const hits: NodeId[] = [];
    const candidates = root.querySelectorAll<SVGElement>(`[${ID_ATTR}]`);
    candidates.forEach((el) => {
      const id = el.getAttribute(ID_ATTR);
      if (!id) return;
      const b = this.bounds_of(id);
      if (b && cmath.rect.intersects(b, rect)) hits.push(id);
    });
    return hits;
  }

  node_at_point(p: Vec2): NodeId | null {
    return this.accessors.pick_at_world(p, true);
  }
}

// ─── Hit-shape driver (SVG-native, world-space) ─────────────────────────────
//
// Composes two sources into a single `HitShape` per node:
//
//   1. Intrinsic shape from document attributes — `hit_shape_of_doc`
//      in `core/hit-shape/svg-driver.ts`. Covers `<rect>`, `<circle>`,
//      `<ellipse>`, `<line>`, `<polyline>`, `<polygon>`, `<path>`.
//
//   2. Bounds-rect fallback — when intrinsic geometry is unavailable
//      (transformed nodes, `<text>` / `<tspan>`, `<use>`, unknown tags),
//      the world-space AABB from `GeometryProvider.bounds_of` becomes
//      the hit region. This is the editor norm: clicking inside a
//      text's bounding box selects the text, not just on glyph outlines.
//
// Tags in `is_transparent_tag` (`<g>`, `<svg>`, `<defs>`, …) report
// `null` regardless — they're containers / non-rendering and never
// participate in picking. Root pickability is handled separately by the
// surface (see `_pick_node_at_world`'s `allow_root` path).
//
// Wrapped by `MemoizedHitShapeProvider`; invalidation rides the existing
// `subscribe_structure` / `subscribe_geometry` signals.

type HitShapeAccessors = {
  doc(): import("./core/document").SvgDocument | null;
  bounds_of(id: NodeId): Rect | null;
};

class SvgHitShapeDriver implements HitShapeDriver {
  constructor(private readonly accessors: HitShapeAccessors) {}

  hit_shape_of(id: NodeId): HitShape | null {
    const doc = this.accessors.doc();
    if (!doc) return null;
    const intrinsic = hit_shape_of_doc(doc, id);
    if (intrinsic) return intrinsic;
    if (is_transparent_tag(doc.tag_of(id))) return null;
    // Bounds-rect fallback. `bounds_of` returns world-space bounds with
    // any inherited CTM already composed, so this correctly handles
    // transformed nodes too.
    const bounds = this.accessors.bounds_of(id);
    if (!bounds) return null;
    return {
      kind: "rect",
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
  }
}
