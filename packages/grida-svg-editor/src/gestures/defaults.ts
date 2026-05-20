// Default gesture bindings shipped with `@grida/svg-editor`.
//
// One row per default — add a binding by appending to `DEFAULT_GESTURE_BINDINGS`.
// Native trackpad pinch reports `ctrlKey=true` on macOS, so the wheel handler
// catches both Cmd+wheel and pinch. Keyboard zoom shortcuts live here (not in
// `editor.keymap`) because they're viewport actions, not editor commands.

import cmath from "@grida/cmath";
import { is_text_input_focused } from "../util/dom";
import type { GestureBinding, GestureContext, Gestures } from "./gestures";

/** Default margin for `camera.fit` from keyboard shortcuts. */
const KEYBOARD_FIT_MARGIN = 64;
/** Default zoom step for `Cmd/Ctrl+=` / `Cmd/Ctrl+-`. */
const ZOOM_STEP = 1.2;
/** Per-wheel-unit zoom sensitivity for Cmd/Ctrl+wheel + pinch. */
const WHEEL_ZOOM_SENSITIVITY = 0.01;
/** Min/max zoom clamps. Generous; hosts that want tighter limits can
 *  unbind these defaults and bind their own. */
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 256;

function clamp_zoom(z: number): number {
  return cmath.clamp(z, MIN_ZOOM, MAX_ZOOM);
}

/** wheel-pan-zoom: plain wheel = pan, Cmd/Ctrl+wheel + pinch = zoom-at-cursor. */
const WHEEL_PAN_ZOOM: GestureBinding = {
  id: "wheel-pan-zoom",
  install({ container, camera }) {
    const on_wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = 1 - e.deltaY * WHEEL_ZOOM_SENSITIVITY;
        const next_zoom = clamp_zoom(camera.zoom * factor);
        const eff = next_zoom / camera.zoom;
        if (eff === 1) return;
        const rect = container.getBoundingClientRect();
        camera.zoom_at(eff, {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      } else {
        camera.pan({ x: -e.deltaX, y: -e.deltaY });
      }
    };
    container.addEventListener("wheel", on_wheel, { passive: false });
    return () => container.removeEventListener("wheel", on_wheel);
  },
};

/**
 * Begin a drag-pan from a pointerdown. Attaches `pointermove` / `pointerup`
 * listeners scoped to the gesture lifetime, then detaches them on release.
 * This is the d3-drag pattern: global listeners only exist while a drag is
 * in flight, not for the surface's whole lifetime.
 */
function begin_drag_pan(
  e: PointerEvent,
  container: HTMLElement,
  camera: GestureContext["camera"],
  on_release?: () => void
): void {
  let last_x = e.clientX;
  let last_y = e.clientY;
  try {
    container.setPointerCapture(e.pointerId);
  } catch {
    /* some hosts disallow capture; harmless */
  }
  e.preventDefault();
  e.stopPropagation();

  const win = container.ownerDocument.defaultView ?? window;
  const on_pointermove = (ev: PointerEvent) => {
    const dx = ev.clientX - last_x;
    const dy = ev.clientY - last_y;
    last_x = ev.clientX;
    last_y = ev.clientY;
    camera.pan({ x: dx, y: dy });
    ev.preventDefault();
    ev.stopPropagation();
  };
  const cleanup = () => {
    win.removeEventListener("pointermove", on_pointermove, true);
    win.removeEventListener("pointerup", on_pointerup, true);
    win.removeEventListener("pointercancel", on_pointerup, true);
    on_release?.();
  };
  const on_pointerup = () => cleanup();
  win.addEventListener("pointermove", on_pointermove, true);
  win.addEventListener("pointerup", on_pointerup, true);
  win.addEventListener("pointercancel", on_pointerup, true);
}

/** space-drag-pan: hold Space + drag to pan (hand tool). */
const SPACE_DRAG_PAN: GestureBinding = {
  id: "space-drag-pan",
  install({ container, camera }) {
    let space_held = false;
    let prev_cursor: string | null = null;
    const set_cursor = (next: string | null) => {
      if (prev_cursor === null) prev_cursor = container.style.cursor;
      container.style.cursor = next ?? prev_cursor ?? "";
      if (next === null) prev_cursor = null;
    };

    const on_keydown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (is_text_input_focused()) return;
      space_held = true;
      set_cursor("grab");
      e.preventDefault();
    };
    const on_keyup = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      space_held = false;
      set_cursor(null);
    };
    const on_pointerdown = (e: PointerEvent) => {
      if (!space_held || e.button !== 0) return;
      set_cursor("grabbing");
      begin_drag_pan(e, container, camera, () =>
        set_cursor(space_held ? "grab" : null)
      );
    };
    const on_blur = () => {
      space_held = false;
      set_cursor(null);
    };

    const win = container.ownerDocument.defaultView ?? window;
    win.addEventListener("keydown", on_keydown);
    win.addEventListener("keyup", on_keyup);
    container.addEventListener("pointerdown", on_pointerdown, true);
    win.addEventListener("blur", on_blur);
    return () => {
      win.removeEventListener("keydown", on_keydown);
      win.removeEventListener("keyup", on_keyup);
      container.removeEventListener("pointerdown", on_pointerdown, true);
      win.removeEventListener("blur", on_blur);
      if (prev_cursor !== null) container.style.cursor = prev_cursor;
    };
  },
};

/** middle-mouse-pan: drag with the middle mouse button to pan. */
const MIDDLE_MOUSE_PAN: GestureBinding = {
  id: "middle-mouse-pan",
  install({ container, camera }) {
    const on_pointerdown = (e: PointerEvent) => {
      if (e.button !== 1) return; // middle button
      begin_drag_pan(e, container, camera);
    };
    // Some browsers fire autoscroll on middle-click — suppress.
    const on_auxclick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    container.addEventListener("pointerdown", on_pointerdown, true);
    container.addEventListener("auxclick", on_auxclick);
    return () => {
      container.removeEventListener("pointerdown", on_pointerdown, true);
      container.removeEventListener("auxclick", on_auxclick);
    };
  },
};

/** keyboard-zoom: Shift+0 / Shift+1 / Shift+2 / Cmd+= / Cmd+- shortcuts. */
const KEYBOARD_ZOOM: GestureBinding = {
  id: "keyboard-zoom",
  install({ container, camera }) {
    const owner_doc = container.ownerDocument;
    const on_keydown = (e: KeyboardEvent) => {
      // Doc-level listener gated to "this container's tree has focus" —
      // surfaces in other windows / panels stay independent.
      const active = owner_doc.activeElement;
      if (active && active !== owner_doc.body && !container.contains(active)) {
        return;
      }
      if (is_text_input_focused()) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.shiftKey && !mod && (e.code === "Digit0" || e.code === "Numpad0")) {
        camera.reset();
        e.preventDefault();
      } else if (
        e.shiftKey &&
        !mod &&
        (e.code === "Digit1" ||
          e.code === "Digit9" ||
          e.code === "Numpad1" ||
          e.code === "Numpad9")
      ) {
        camera.fit("<root>", { margin: KEYBOARD_FIT_MARGIN });
        e.preventDefault();
      } else if (
        e.shiftKey &&
        !mod &&
        (e.code === "Digit2" || e.code === "Numpad2")
      ) {
        camera.fit("<selection>", { margin: KEYBOARD_FIT_MARGIN });
        e.preventDefault();
      } else if (mod && (e.code === "Equal" || e.code === "NumpadAdd")) {
        camera.set_zoom(clamp_zoom(camera.zoom * ZOOM_STEP));
        e.preventDefault();
      } else if (mod && (e.code === "Minus" || e.code === "NumpadSubtract")) {
        camera.set_zoom(clamp_zoom(camera.zoom / ZOOM_STEP));
        e.preventDefault();
      }
    };
    owner_doc.addEventListener("keydown", on_keydown);
    return () => owner_doc.removeEventListener("keydown", on_keydown);
  },
};

/** The data-driven default set. Order = install order. */
export const DEFAULT_GESTURE_BINDINGS: readonly GestureBinding[] = [
  WHEEL_PAN_ZOOM,
  SPACE_DRAG_PAN,
  MIDDLE_MOUSE_PAN,
  KEYBOARD_ZOOM,
];

/** Install every default binding into the gesture layer. */
export function applyDefaultGestures(gestures: Gestures): void {
  for (const b of DEFAULT_GESTURE_BINDINGS) {
    gestures.bind(b);
  }
}
