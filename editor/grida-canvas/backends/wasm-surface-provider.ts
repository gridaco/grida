import type {
  Scene,
  SurfaceResponse,
  SurfaceCursorIcon,
} from "@grida/canvas-wasm";
import { encodeModifiers, encodeButton } from "@grida/canvas-wasm";
import type { Action } from "@/grida-canvas/action";

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
  private abortController: AbortController;
  private dpr: number;

  constructor(
    scene: Scene,
    target: HTMLElement,
    dispatch: (action: Action) => void,
    dpr: number = 1
  ) {
    this.scene = scene;
    this.target = target;
    this.dispatch = dispatch;
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
      this.syncSelection();
      return;
    }

    // Escape → deselect all
    if (e.key === "Escape") {
      this.scene.deselectAll();
      this.syncSelection();
      return;
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
