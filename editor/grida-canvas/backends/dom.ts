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
      const viewport = this.getViewport();
      if (!viewport) {
        return [0, 0];
      }
      const rect = viewport.getBoundingClientRect();
      return [rect.left, rect.top];
    }

    get rect() {
      const viewport = this.getViewport();
      if (!viewport) {
        // Return default rect when viewport element doesn't exist yet
        return {
          left: 0,
          top: 0,
          right: typeof window !== "undefined" ? window.innerWidth : 0,
          bottom: typeof window !== "undefined" ? window.innerHeight : 0,
          width: typeof window !== "undefined" ? window.innerWidth : 0,
          height: typeof window !== "undefined" ? window.innerHeight : 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return viewport.getBoundingClientRect();
    }

    get size() {
      const viewport = this.getViewport();
      if (!viewport) {
        // Return default size when viewport element doesn't exist yet
        // This can happen during initial render before ViewportRoot mounts
        return {
          width: typeof window !== "undefined" ? window.innerWidth : 0,
          height: typeof window !== "undefined" ? window.innerHeight : 0,
        };
      }
      const rect = viewport.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    }

    getViewportRect() {
      const viewport = this.getViewport();
      if (!viewport) {
        // Return default rect when viewport element doesn't exist yet
        return {
          left: 0,
          top: 0,
          right: typeof window !== "undefined" ? window.innerWidth : 0,
          bottom: typeof window !== "undefined" ? window.innerHeight : 0,
          width: typeof window !== "undefined" ? window.innerWidth : 0,
          height: typeof window !== "undefined" ? window.innerHeight : 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      }
      return viewport.getBoundingClientRect();
    }

    getViewportSize(): { width: number; height: number } {
      const viewport = this.getViewport();
      if (!viewport) {
        // Return default size when viewport element doesn't exist yet
        // This can happen during initial render before ViewportRoot mounts
        return {
          width: typeof window !== "undefined" ? window.innerWidth : 0,
          height: typeof window !== "undefined" ? window.innerHeight : 0,
        };
      }
      const rect = viewport.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
      };
    }
  }
}
