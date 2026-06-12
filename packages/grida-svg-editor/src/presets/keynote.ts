// Keynote preset — slide-shaped SVG canvas (cover-constraint + auto-refit
// on load). Pure composition over the public package surface: imports only
// from the published subpaths (`../index`, `../dom`), never from `core/`,
// `commands/`, `keymap/`, or `gestures/`. This file IS the canonical
// reference for "how to build a preset on top of @grida/svg-editor."
//
// See plan §3 / §10 for the import-discipline contract.

import type { SvgEditor } from "..";
import {
  attach_dom_surface,
  type DomSurfaceHandle,
  type DomSurfaceOptions,
} from "../dom";

export type KeynoteAttachOptions = {
  /** Container to mount the SVG into. */
  container: HTMLElement;
  /**
   * Screen-pixel breathing room between the slide and the viewport edge.
   * Used for both initial fit and the cover-constraint clamp. Default 80.
   */
  padding?: number;
  /**
   * Screen-pixel scroll slack past the slide edge when zoomed in past fit.
   * Forwarded to the cover constraint's `pan_overshoot`. Default 0 — strict
   * cover behavior (no panning past the slide edge). Applies only when an
   * axis is scrollable; a fitted axis stays locked at center.
   */
  pan_overshoot?: number;
  /**
   * Forward additional surface options (e.g. `gestures: false`). `container`,
   * `fit`, and `initial_camera` are owned by the preset.
   */
  surface?: Omit<DomSurfaceOptions, "container" | "fit" | "initial_camera">;
};

/**
 * Surface handle returned by `keynote.attach`. Extends `DomSurfaceHandle`
 * with `set_padding` so hosts can vary the slide breathing room at runtime
 * (e.g. on a "present mode" toggle that wants margin: 0 vs the default 80).
 */
export type KeynoteSurfaceHandle = DomSurfaceHandle & {
  /**
   * Update the slide padding and re-fit. Mutates the live constraint AND
   * the captured padding used by load-triggered refits.
   */
  set_padding(p: number): void;
  /**
   * Update the scroll-past slack at runtime. Mutates the live constraint;
   * `reenforce()` pulls a previously over-panned transform back into the
   * new range when the value is decreased.
   */
  set_pan_overshoot(o: number): void;
};

/**
 * Attach a keynote-shaped DOM surface:
 * - Mounts via `attach_dom_surface` with `fit: true` (slide is visible on
 *   first frame).
 * - Installs a `'cover'` camera constraint bound to the document root, so
 *   the user can't zoom out past the slide or pan past its edges.
 * - Subscribes to `editor.state.load_version` so every `editor.load(svg)`
 *   re-fits the camera to the new document.
 *
 * Returns a `KeynoteSurfaceHandle` — same shape as `DomSurfaceHandle` plus
 * `set_padding` for present-mode toggles. The returned `detach()`
 * additionally tears down the load subscription.
 */
export function attach(
  editor: SvgEditor,
  opts: KeynoteAttachOptions
): KeynoteSurfaceHandle {
  const inner = attach_dom_surface(editor, {
    ...opts.surface,
    container: opts.container,
    fit: true,
  });
  let padding = opts.padding ?? 80;
  let pan_overshoot = opts.pan_overshoot ?? 0;
  const apply = () => {
    inner.camera.constraints = {
      type: "cover",
      bounds: "<root>",
      padding,
      pan_overshoot,
    };
  };
  apply();
  // Refit on every editor.load(). The current padding is read live from
  // the constraint, so set_padding mutations affect subsequent refits.
  const unsub_load = editor.subscribe_with_selector(
    (s) => s.load_version,
    () =>
      inner.camera.fit("<root>", {
        margin: inner.camera.constraints?.padding ?? 0,
      })
  );
  return {
    camera: inner.camera,
    gestures: inner.gestures,
    attention: inner.attention,
    set_padding(p: number) {
      padding = p;
      apply();
      inner.camera.fit("<root>", { margin: p });
    },
    set_pan_overshoot(o: number) {
      pan_overshoot = o;
      apply();
    },
    detach: () => {
      unsub_load();
      inner.detach();
    },
  };
}
