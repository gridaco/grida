import grida from "@grida/schema";
import cmath from "@grida/cmath";

/**
 * A dom api for the canvas html backend.
 *
 * @deprecated
 */
export namespace domapi {
  type INode = {
    id: string;
  };

  export namespace k {
    export const VIEWPORT_ELEMENT_ID = "grida-canvas-sdk-viewport";
    export const EDITOR_CONTENT_ELEMENT_ID = "grida-canvas-sdk-editor-content";
  }

  /**
   * All elements with the `data-grida-node-id` attribute.
   * @deprecated Expensive
   */
  function __get_grida_node_elements(): NodeListOf<Element> | undefined {
    const content = __get_content_element();
    return content?.querySelectorAll(
      `[${grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY}]`
    );
  }

  function __get_content_element() {
    return window.document.getElementById(k.EDITOR_CONTENT_ELEMENT_ID);
  }

  function __get_viewport_element() {
    return window.document.getElementById(k.VIEWPORT_ELEMENT_ID);
  }

  export function getViewportRect() {
    const el = __get_viewport_element();
    return el!.getBoundingClientRect();
  }

  export function getViewportSize(): { width: number; height: number } {
    const el = __get_viewport_element();
    return {
      width: el!.clientWidth,
      height: el!.clientHeight,
    };
  }

  /**
   *
   * @param x clientX
   * @param y clientY
   * @returns
   */
  export function getNodeIdsFromPoint(x: number, y: number): string[] {
    const hits = window.document.elementsFromPoint(x, y);

    const node_elements = hits.filter((h) =>
      h.attributes.getNamedItem(
        grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY
      )
    );

    return node_elements.map((el) => el.id);
  }

  export class CanvasDOM {
    readonly scale: cmath.Vector2;
    constructor(readonly transform: cmath.Transform) {
      this.scale = cmath.transform.getScale(transform);
    }

    getNodesIntersectsArea(area: cmath.Rectangle): string[] {
      const contained: string[] = [];
      const all_els = __get_grida_node_elements();

      all_els?.forEach((el: INode) => {
        const rect = this.getNodeBoundingRect(el.id);
        if (!rect) return;
        if (cmath.rect.intersects(rect, area)) {
          contained.push(el.id);
        }
      });

      return contained;
    }

    /**
     * returns a bounding rect of the node in canvas space (consistant with the transform)
     * @param node_id
     * @returns
     */
    getNodeBoundingRect(node_id: string): cmath.Rectangle | null {
      const contentrect = __get_content_element()?.getBoundingClientRect();
      const noderect = window.document
        .getElementById(node_id)
        ?.getBoundingClientRect();

      if (!contentrect) {
        throw new Error("renderer missing - content element rect is null");
      }

      if (!noderect) {
        return null;
      }

      const domrect = {
        x: noderect.x - contentrect.x,
        y: noderect.y - contentrect.y,
        width: noderect.width,
        height: noderect.height,
      } satisfies cmath.Rectangle;

      const rect = cmath.rect.scale(
        domrect,
        [0, 0],
        [1 / this.scale[0], 1 / this.scale[1]]
      );

      // ignore floating point to 0.001 precision
      // // quantized to 0.01 precision
      // const qrect = {
      //   x: Math.round(rect.x * 1000) / 1000,
      //   y: Math.round(rect.y * 1000) / 1000,
      //   width: Math.round(rect.width * 1000) / 1000,
      //   height: Math.round(rect.height * 1000) / 1000,
      // };
      // return qrect

      return rect;
    }
  }
}
