import cmath from "@grida/cmath";

import assert from "assert";

/**
 * A dom api for the canvas html backend.
 *
 * @deprecated
 */
export namespace domapi {
  export type INode = {
    id: string;
  };

  export namespace k {
    export const VIEWPORT_ELEMENT_ID = "grida-canvas-sdk-viewport";
    export const EDITOR_CONTENT_ELEMENT_ID = "grida-canvas-sdk-editor-content";
  }

  export class DOMViewportApi {
    constructor(
      readonly element: string | HTMLElement = k.VIEWPORT_ELEMENT_ID
    ) {
      assert(
        typeof element === "string" || element instanceof HTMLElement,
        "element must be a string (id) or an HTMLElement"
      );
    }

    getViewport() {
      if (typeof this.element === "string") {
        return window.document.getElementById(this.element);
      } else if (this.element instanceof HTMLElement) {
        return this.element;
      } else {
        throw new Error("failed to get viewport element");
      }
    }

    get offset(): cmath.Vector2 {
      const rect = this.getViewport()!.getBoundingClientRect();
      return [rect.left, rect.top];
    }

    get rect() {
      return this.getViewport()!.getBoundingClientRect();
    }

    get size() {
      const rect = this.getViewport()!.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    }

    getViewportRect() {
      return this.getViewport()!.getBoundingClientRect();
    }

    getViewportSize(): { width: number; height: number } {
      const rect = this.getViewport()!.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    }
  }
}
