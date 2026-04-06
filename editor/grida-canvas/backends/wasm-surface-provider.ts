import type {
  Scene,
  SurfaceResponse,
  SurfaceCursorIcon,
} from "@grida/canvas-wasm";
import { encodeModifiers, encodeButton } from "@grida/canvas-wasm";
import type { Action } from "@/grida-canvas/action";

/**
 * Minimal camera interface for viewport zoom shortcuts.
 * Keeps CanvasSurfaceUI decoupled from the full Editor instance.
 */
export interface SurfaceCamera {
  fit(
    selector: "<scene>" | "selection",
    options?: {
      margin?: number | [number, number, number, number];
      animate?: boolean;
    }
  ): void;
  scale(factor: number, origin: "center"): void;
}

/**
 * Handles DOM events and routes them directly to the WASM surface,
 * bypassing the React reducer/overlay pipeline entirely.
 *
 * Dispatches standard `"select"` / `"blur"` actions so the JS editor
 * state stays in sync without needing a special action type.
 *
 * Use for readonly canvas (`editable === false`, `backend === "canvas"`)
 * where the WASM engine renders overlays natively.
 */
export class CanvasSurfaceUI {
  private scene: Scene;
  private target: HTMLElement;
  private dispatch: (action: Action) => void;
  private camera: SurfaceCamera;
  private abortController: AbortController;
  private dpr: number;

  constructor(
    scene: Scene,
    target: HTMLElement,
    dispatch: (action: Action) => void,
    camera: SurfaceCamera,
    dpr: number = 1
  ) {
    this.scene = scene;
    this.target = target;
    this.dispatch = dispatch;
    this.camera = camera;
    this.dpr = dpr;
    this.abortController = new AbortController();
    this.bind();
  }

  private bind() {
    const opts = { signal: this.abortController.signal } as const;

    this.target.addEventListener("pointermove", this.handlePointerMove, opts);
    this.target.addEventListener("pointerdown", this.handlePointerDown, opts);
    this.target.addEventListener("pointerup", this.handlePointerUp, opts);

    // Keyboard events for select-all / deselect-all
    // We listen on window because the canvas element may not be focusable
    window.addEventListener("keydown", this.handleKeyDown, opts);
  }

  private handlePointerMove = (e: PointerEvent) => {
    // Convert CSS pixels → physical pixels (WASM camera works in physical space)
    const x = e.offsetX * this.dpr;
    const y = e.offsetY * this.dpr;
    const response = this.scene.surfacePointerMove(x, y);
    this.applyCursor(response);
    this.applyStateSync(response);
  };

  private handlePointerDown = (e: PointerEvent) => {
    const x = e.offsetX * this.dpr;
    const y = e.offsetY * this.dpr;
    const mods = encodeModifiers(e);
    const btn = encodeButton(e.button);
    const response = this.scene.surfacePointerDown(x, y, btn, mods);
    this.applyCursor(response);
    this.applyStateSync(response);
  };

  private handlePointerUp = (e: PointerEvent) => {
    const x = e.offsetX * this.dpr;
    const y = e.offsetY * this.dpr;
    const mods = encodeModifiers(e);
    const btn = encodeButton(e.button);
    const response = this.scene.surfacePointerUp(x, y, btn, mods);
    this.applyCursor(response);
    this.applyStateSync(response);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    // Cmd+A / Ctrl+A → select all
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    if (cmdOrCtrl && e.key === "a") {
      e.preventDefault();
      this.scene.selectAll();
      this.scene.redraw();
      this.syncSelection();
      return;
    }

    // Escape → deselect all
    if (e.key === "Escape") {
      this.scene.deselectAll();
      this.scene.redraw();
      this.syncSelection();
      return;
    }

    // Node navigation shortcuts (matches grida-dev native bindings)
    // Tab → next sibling, Shift+Tab → previous sibling
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        this.scene.selectPreviousSibling();
      } else {
        this.scene.selectNextSibling();
      }
      this.scene.redraw();
      this.syncSelection();
      return;
    }

    // Enter → select children, Shift+Enter → select parent
    // TODO: On a leaf text node, Select(Children) falls through to
    // try_enter_text_edit in Rust. The embed viewer has no text editing
    // support (no IME forwarding, no text edit UI). Needs a Rust-side
    // config flag to disable text edit entry from the command path.
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        this.scene.selectParent();
      } else {
        this.scene.selectChildren();
      }
      this.scene.redraw();
      this.syncSelection();
      return;
    }

    // Viewport zoom shortcuts (Shift + digit)
    // Camera is JS-driven (state.transform → WASM syncTransform), so these
    // must go through the JS camera API, not WASM _command().
    // TODO: Camera should be owned by WASM with a callback to sync back to JS
    // (following the same pattern as selection sync), eliminating this split.
    if (e.shiftKey) {
      switch (e.code) {
        case "Digit1":
          e.preventDefault();
          this.camera.fit("<scene>", { margin: 64 });
          return;
        case "Digit2":
          e.preventDefault();
          this.camera.fit("selection", { margin: 64 });
          return;
        case "Digit0":
          e.preventDefault();
          this.camera.scale(1, "center");
          return;
      }
    }
  };

  private applyCursor(response: SurfaceResponse) {
    if (response.cursorChanged) {
      const cursor = this.scene.getSurfaceCursor();
      this.target.style.cursor = cssCursor(cursor);
    }
  }

  private applyStateSync(response: SurfaceResponse) {
    if (response.selectionChanged) {
      this.syncSelection();
    }
  }

  private syncSelection() {
    const ids = this.scene.getSurfaceSelectedNodes();
    if (ids.length === 0) {
      this.dispatch({ type: "blur" });
    } else {
      this.dispatch({ type: "select", selection: ids });
    }
  }

  /**
   * Remove all event listeners and release references.
   */
  destroy() {
    this.abortController.abort();
  }
}

function cssCursor(cursor: SurfaceCursorIcon): string {
  switch (cursor) {
    case "pointer":
      return "pointer";
    case "grab":
      return "grab";
    case "grabbing":
      return "grabbing";
    case "crosshair":
      return "crosshair";
    case "move":
      return "move";
    case "default":
    default:
      return "default";
  }
}
