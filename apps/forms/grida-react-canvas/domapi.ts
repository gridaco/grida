import { grida } from "@/grida";
import { cmath } from "@grida/cmath";

/**
 * A dom api for the canvas html backend.
 */
export namespace domapi {
  export namespace k {
    export const VIEWPORT_ELEMENT_ID = "grida-canvas-sdk-viewport";
    export const EDITOR_CONTENT_ELEMENT_ID = "grida-canvas-sdk-editor-content";
  }

  export function get_node_element(node_id: string) {
    return window.document.getElementById(node_id);
  }

  export class CanvasDOM {
    readonly scale: cmath.Vector2;
    constructor(readonly transform: cmath.Transform) {
      this.scale = cmath.transform.getScale(transform);
    }

    getAllNodeElements(): NodeListOf<Element> | undefined {
      return get_grida_node_elements();
    }

    getNodesIntersectsArea(area: cmath.Rectangle): string[] {
      const contained: string[] = [];
      const all_els = get_grida_node_elements();

      all_els?.forEach((el) => {
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
      const contentrect = get_content_element()?.getBoundingClientRect();
      const noderect = get_node_element(node_id)?.getBoundingClientRect();

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

      return rect;
    }
  }

  function get_content_element() {
    return window.document.getElementById(k.EDITOR_CONTENT_ELEMENT_ID);
  }

  function get_viewport_element() {
    return window.document.getElementById(k.VIEWPORT_ELEMENT_ID);
  }

  export function get_viewport_rect() {
    const el = get_viewport_element();
    return el!.getBoundingClientRect();
  }

  /**
   * All elements with the `data-grida-node-id` attribute.
   * @deprecated Expensive
   */
  function get_grida_node_elements(): NodeListOf<Element> | undefined {
    const content = get_content_element();
    return content?.querySelectorAll(
      `[${grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY}]`
    );
  }

  /**
   *
   * @param x clientX
   * @param y clientY
   * @returns
   */
  export function get_grida_node_elements_from_point(x: number, y: number) {
    const hits = window.document.elementsFromPoint(x, y);

    const node_elements = hits.filter((h) =>
      h.attributes.getNamedItem(
        grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY
      )
    );

    return node_elements;
  }
}
