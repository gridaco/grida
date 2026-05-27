// ---------------------------------------------------------------------------
// HUDHost — bridge between the Grida editor and the @grida/hud Surface.
//
// Per /code-ts doctrine, this is a class + namespace (not a hook). It owns
// the wiring lifetime — construction is paired with a (host-wired) editor;
// `attach(surface)` binds a live Surface; `detach()` unbinds. All gesture /
// hover / cursor / hit-test state lives inside the Surface; HUDHost owns
// only the mirror (editor → HUD) and the intent sink (HUD → editor).
//
// Phase 1 deliverable (this file): scaffold + stubs. Bodies for most intent
// kinds are intentionally TODO no-ops. Selection and deselect_all are wired
// so the switch statement compiles with realistic cases. Phases 2-7 will
// fill the remaining intents; Phase 6 implements `getSelectionScreenRect`.
//
// Search for `TODO(hud-replace-surface):` to find all the work items left
// for later phases (Phase 10 sweeps these out).
// ---------------------------------------------------------------------------

import type cmath from "@grida/cmath";
import type {
  Surface,
  SurfaceEvent,
  Intent,
  SelectionShape,
  VectorOverlay,
} from "@grida/hud";
import type { Editor } from "@/grida-canvas/editor";
import { syncHUDClasses } from "./hud-host-classes";

export class HUDHost {
  private surface: Surface | null = null;
  private unsubscribe: (() => void) | null = null;
  private rafHandle: number | null = null;
  // Cached projected selection AABB (Phase 6 will populate; null until then).
  private cachedSelectionScreenRect: cmath.Rectangle | null = null;
  // Transient gesture label for history bracket — set on first preview of a
  // continuous gesture, cleared on commit/discard. Reserved for Phase 2 when
  // translate/resize/rotate land; not yet read so the linter would normally
  // complain, but the field is part of the documented contract.
  // TODO(hud-replace-surface): Phase 2 — read/write from intent handlers.
  // eslint-disable-next-line @typescript-eslint/no-unused-private-class-members
  private currentGestureLabel: string | null = null;

  constructor(private readonly editor: Editor) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /**
   * Attach a Surface. The host begins mirroring editor state onto the
   * surface on every editor tick. Must call `detach()` before reattaching.
   */
  attach(surface: Surface): void {
    if (this.surface) {
      // Defensive: detach first so we don't leak the prior subscription.
      this.detach();
    }
    this.surface = surface;
    // Initial flush so the surface reflects current editor state before any
    // tick fires.
    this.flush();
    this.unsubscribe = this.editor.subscribe(() => {
      // The subscription fires synchronously from inside the reducer dispatch.
      // Per /code-ts (and the master plan §"Risk register #3"), we mirror
      // selection / transform synchronously here — useEffect would lag a
      // frame and bleed stale chrome over the next paint.
      this.mirror();
    });
  }

  /**
   * Detach. Clears the subscription and the surface ref; safe to call when
   * already detached. Does not dispose the Surface — that's the caller's
   * responsibility (the React layer that owns the canvas mount).
   */
  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (
      this.rafHandle !== null &&
      typeof cancelAnimationFrame !== "undefined"
    ) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.surface = null;
    this.cachedSelectionScreenRect = null;
  }

  // ── Input forwarding ────────────────────────────────────────────────────

  /**
   * Called by `SurfaceInputLayer` on every translated event. Forwards into
   * the surface state machine and schedules a redraw if the surface
   * requested one.
   */
  dispatchSurfaceEvent(ev: SurfaceEvent): void {
    const surface = this.surface;
    if (!surface) return;
    const r = surface.dispatch(ev);
    if (r.needsRedraw) {
      this.scheduleRedraw();
    }
  }

  // ── Surface providers ───────────────────────────────────────────────────

  /**
   * Provider — picks the topmost node id at a doc-space point. Wired into
   * `useHUDSurface({ pick })` / `new Surface({ pick })`. Reuses the editor's
   * geometry provider (which delegates to whichever backend — DOM-SVG or
   * WASM canvas — currently owns the scene).
   */
  pick = (point_doc: [number, number]): string | null => {
    // TODO(hud-replace-surface): respect `state.pointer_hit_testing_config`
    // for lock filtering. For now, last-wins from the raw point query.
    const ids = this.editor.getNodeIdsFromPoint(point_doc);
    return ids.length > 0 ? ids[ids.length - 1] : null;
  };

  /**
   * Provider — selection shape for `id`. Most nodes are rect-bounded;
   * line/vector nodes will resolve to richer shapes in later phases.
   */
  shapeOf = (id: string): SelectionShape | null => {
    const rect = this.editor.getNodeAbsoluteBoundingRect(id);
    if (!rect) return null;
    // TODO(hud-replace-surface): line / polygon nodes need `{ kind: "line", ... }`
    // and `{ kind: "polygon", ... }` shapes. Phase 7 wires those once the
    // vector content-edit path is migrated.
    return {
      kind: "rect",
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
    };
  };

  /**
   * Provider — vector overlay for `id` (vertex/segment/tangent geometry
   * used by the vector-path named class). Phase 7 implements this.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  vectorOf = (_id: string): VectorOverlay | null => {
    // TODO(hud-replace-surface): wire to editor.cemVector* / vector_network
    // accessor (Phase 7). Returning null here is safe — the HUD silently
    // skips vector chrome when the host doesn't provide it.
    return null;
  };

  // ── Intent sink ─────────────────────────────────────────────────────────

  /**
   * Intent sink. The Surface emits intents on every committable change; the
   * host commits them into editor actions. Preview-phase intents wrap in
   * `editor.previewStart` / `previewSet`; commit-phase intents land via
   * `previewCommit`. Phase 1 implements only `select` / `deselect_all` — the
   * rest land in Phase 2+ and currently log so we can see them firing during
   * Phase 2 spike testing.
   */
  onIntent = (intent: Intent): void => {
    switch (intent.kind) {
      case "select": {
        // HUD select modes ("replace" | "add" | "toggle") map 1:1 onto the
        // editor's select() second-arg vocabulary ("reset" | "add" | "toggle").
        // "replace" → "reset" is the only translation needed.
        const mode: "reset" | "add" | "toggle" =
          intent.mode === "replace" ? "reset" : intent.mode;
        this.editor.commands.select([...intent.ids], mode);
        return;
      }
      case "deselect_all": {
        // editor.commands.blur takes no args; the debug_label form lives on
        // the concrete Editor class but isn't part of the api contract.
        this.editor.commands.blur();
        return;
      }
      // TODO(hud-replace-surface): Phase 2 — translate / resize / rotate /
      // marquee_select / lasso_select / cancel_gesture (preview/commit
      // bracketed by editor.previewStart / previewSet / previewCommit /
      // previewDiscard).
      case "translate":
      case "resize":
      case "rotate":
      case "marquee_select":
      case "lasso_select":
      case "cancel_gesture":
      // TODO(hud-replace-surface): Phase 2 — set_endpoint (line endpoints).
      case "set_endpoint":
      // TODO(hud-replace-surface): Phase 7 — enter/exit content-edit forward
      // to editor.surfaceTryEnter*/Exit* (existing actions).
      case "enter_content_edit":
      case "exit_content_edit":
      // TODO(hud-replace-surface): Phase 5 — corner-radius (uniform/explicit
      // wrap preview, single editor.setCornerRadius* setter on commit).
      case "corner_radius":
      case "corner_radius_explicit":
      case "corner_radius_uniform":
      // TODO(hud-replace-surface): Phase 5 — universal parametric handle.
      case "parametric_handle":
      // TODO(hud-replace-surface): Phase 2 — padding (replaces gesture/padding
      // reducer case) and transform-box (image-fit transform, etc.).
      case "padding_handle":
      case "transform_box":
      // TODO(hud-replace-surface): Phase 7 — vector-path edit intents.
      case "select_vertex":
      case "translate_vertices":
      case "translate_vector_selection":
      case "clear_vector_selection":
      case "select_segment":
      case "select_region":
      case "select_tangent":
      case "set_tangent":
      case "split_segment":
      case "bend_segment":
        // eslint-disable-next-line no-console
        console.warn(
          "[HUDHost]",
          intent.kind,
          "not yet wired — see TODO(hud-replace-surface) in hud-host.ts"
        );
        return;
      default: {
        // Exhaustiveness probe: if a new intent kind appears upstream, the
        // type system flags it here. Cast to `never` is intentional.
        const _exhaust: never = intent;
        void _exhaust;
        // eslint-disable-next-line no-console
        console.warn("[HUDHost] unknown intent", intent);
        return;
      }
    }
  };

  // ── Read-only introspection (for DOM overlays / floating bars) ──────────

  /**
   * Cached projected selection AABB in screen-space, for floating bars that
   * pin to the selection chrome. Recomputed at most once per editor tick;
   * `null` when there's no selection (or while Phase 6 is unwired).
   *
   * Phase 6 implements the actual projection — until then this returns
   * `null` so callers can wire the contract without seeing wrong rects.
   */
  getSelectionScreenRect(): cmath.Rectangle | null {
    // TODO(hud-replace-surface): Phase 6 — project the union AABB of
    // selected nodes' doc-space rects through state.transform and cache.
    return this.cachedSelectionScreenRect;
  }

  /**
   * Synchronously mirror editor state to the HUD surface. Useful for tests
   * and for callers that mutated the editor without going through dispatch.
   */
  flush(): void {
    this.mirror();
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private mirror(): void {
    const surface = this.surface;
    if (!surface) return;
    const state = this.editor.getSnapshot();

    // Selection mirror — flat ids; HUD's chrome builder resolves each via
    // `shapeOf`. SelectionGroup-aware multi-selection lands in Phase 6 when
    // floating-bars / measurement need it.
    surface.setSelection(state.selection ?? []);

    // Camera mirror — pixel grid and ruler are pushed by syncHUDClasses;
    // the main scene transform feeds the state machine (hit-tests) here.
    if (state.transform) {
      surface.setTransform(state.transform);
    }

    // Readonly mirror. TODO(hud-replace-surface): the editor's "readonly"
    // signal lives across several fields (editable, document.readonly, …);
    // resolve to one boolean in Phase 2 when input wiring needs it.

    // Per-frame named-class wiring (padding / transform-box / corner-radius
    // / vector / ruler / pixel-grid / cursor). Phase 1 stub; phases 3-7
    // fill in.
    syncHUDClasses(this);

    // Cached selection rect — Phase 6 populates. For now, clear so callers
    // never see a stale rect.
    this.cachedSelectionScreenRect = null;

    this.scheduleRedraw();
  }

  private scheduleRedraw(): void {
    const surface = this.surface;
    if (!surface) return;
    if (typeof requestAnimationFrame === "undefined") {
      // SSR / test environments: draw synchronously. No flicker risk.
      surface.draw();
      return;
    }
    if (this.rafHandle !== null) return;
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      if (!this.surface) return;
      this.surface.draw();
    });
  }

  // Test/debug accessors. Not part of the public contract; kept tight so
  // they don't accidentally become load-bearing.
  /** @internal */
  _getSurface(): Surface | null {
    return this.surface;
  }

  /** @internal */
  _getEditor(): Editor {
    return this.editor;
  }
}

export namespace HUDHost {
  /**
   * Construction options. Phase 1 has none — placeholder so future phases
   * can add config (cursor renderer choice, history-bracket label hook,
   * preview throttle, etc.) without breaking the public type shape.
   */
  export type Options = {
    // TODO(hud-replace-surface): Phase 4 — cursorRenderer choice toggle.
    // TODO(hud-replace-surface): Phase 2 — previewThrottle: "raf" | "none".
  };

  /**
   * Phase 2 will introduce a commit-gate strategy for routing intents that
   * cross gesture boundaries (sort, gap, brush) — see master plan
   * §"Intent → Action mapping" footnote. Stubbed here so the namespace
   * carries the eventual contract.
   */
  export type CommitGate = {
    // TODO(hud-replace-surface): Phase 2 — sort/gap/brush carve-out routing.
  };
}
