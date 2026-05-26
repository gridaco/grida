// Gestures — surface-scoped layer for viewport interaction (wheel / pinch / pan).
//
// Sibling to `editor.keymap`: keymap binds keyboard events to editor commands
// (document mutations); gestures bind pointer/wheel events to camera
// mutations (viewport). Each binding owns its own install/uninstall;
// `Gestures` is a thin orchestrator. Bindings are installed in registration
// order (FIFO); installers `e.stopPropagation()` to prevent fall-through.

import type { Camera } from "../core/camera";
import type { SvgEditor, SurfaceHandle } from "../core/editor";

/** Stable identifier for a gesture binding. Used by `unbind({ id })`. */
export type GestureId = string;

/**
 * Context passed to every installer. Exposes the seams a gesture needs:
 * the container element to listen on, the camera to mutate, and the
 * editor for keymap dispatch / state reads.
 *
 * Surface authors construct this once at attach; bindings receive it on
 * every `install(...)` call.
 */
export type GestureContext = {
  /** Container element listeners attach to. */
  container: HTMLElement;
  /** SVG element being framed by the camera. Useful for hit-testing. */
  svg_root: () => SVGSVGElement | null;
  /** HUD canvas overlay; sits on top of the SVG. */
  hud_canvas: HTMLCanvasElement;
  /** Camera the binding mutates. */
  camera: Camera;
  /** Editor for keymap dispatch / state reads. */
  editor: SvgEditor;
  /** Handle for advanced bindings (e.g. wanting `camera.fit("<selection>")`). */
  handle: SurfaceHandle;
  /**
   * Predicate returning `true` iff the surface is currently "attended" —
   * focus inside the container subtree OR pointer over the container.
   * Gesture bindings whose keydown handlers call `preventDefault()` MUST
   * consult this before claiming, so the surface doesn't steal page-level
   * shortcuts when embedded in a larger document. See `util/attention.ts`.
   */
  is_attended: () => boolean;
};

export type GestureBinding = {
  /** Stable id used by `unbind` / `bindings()`. */
  id: GestureId;
  /**
   * Wire DOM listeners (or any side-effect) needed for this gesture.
   * Returns the uninstaller — called on `unbind` or surface detach.
   */
  install(ctx: GestureContext): () => void;
};

/**
 * Sibling to `Keymap`. Owns a list of installed gesture bindings; each
 * binding's `install(ctx)` is called eagerly when bound and uninstalled
 * on `unbind` or surface detach.
 */
export class Gestures {
  private entries: Array<{
    binding: GestureBinding;
    uninstall: () => void;
  }> = [];

  constructor(private readonly ctx: GestureContext) {}

  /**
   * Install a gesture binding. Returns an unbind function.
   * Re-binding the same `id` does NOT replace — both will be active.
   * Use `unbind({ id })` first if you want a clean swap.
   */
  bind(binding: GestureBinding): () => void {
    const uninstall = binding.install(this.ctx);
    const entry = { binding, uninstall };
    this.entries.push(entry);
    return () => {
      const i = this.entries.indexOf(entry);
      if (i < 0) return;
      this.entries.splice(i, 1);
      uninstall();
    };
  }

  /**
   * Remove bindings matching the spec. With `{ id }`, all bindings with
   * that id are uninstalled. With no spec, this is a no-op (use
   * `dispose()` to nuke everything).
   */
  unbind(spec: { id?: GestureId }): void {
    if (spec.id === undefined) return;
    const remaining: typeof this.entries = [];
    for (const entry of this.entries) {
      if (entry.binding.id === spec.id) {
        entry.uninstall();
      } else {
        remaining.push(entry);
      }
    }
    this.entries = remaining;
  }

  /** All currently installed bindings. Order is registration order. */
  bindings(): readonly GestureBinding[] {
    return this.entries.map((e) => e.binding);
  }

  /** @internal Uninstall every binding. Surface calls on detach. */
  _dispose(): void {
    for (const entry of this.entries) entry.uninstall();
    this.entries = [];
  }
}
