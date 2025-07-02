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

  export class DOMViewportApi {
    constructor(readonly id: string = k.VIEWPORT_ELEMENT_ID) {}

    getViewport() {
      return window.document.getElementById(this.id);
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

  export class DOMContentApi {
    constructor(readonly containerId: string) {}

    private getContainerElement() {
      return window.document.getElementById(this.containerId);
    }

    /**
     * All elements with the `data-grida-node-id` attribute.
     * @deprecated Expensive
     */
    getElements(): NodeListOf<Element> | undefined {
      const content = this.getContainerElement();
      return content?.querySelectorAll(
        `[${grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY}]`
      );
    }

    getBoundingClientRect(): DOMRect | null {
      const el = this.getContainerElement();
      return el?.getBoundingClientRect() ?? null;
    }
  }

  function __get_viewport_element() {
    return window.document.getElementById(k.VIEWPORT_ELEMENT_ID);
  }

  /**
   * @deprecated
   */
  export function getViewportSize(): { width: number; height: number } {
    const el = __get_viewport_element();
    const rect = el!.getBoundingClientRect();

    return {
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   *
   * @param x clientX
   * @param y clientY
   * @returns
   */
  export function getNodeIdsFromPoint(point: cmath.Vector2): string[] {
    const hits = window.document.elementsFromPoint(point[0], point[1]);

    const node_elements = hits.filter((h) =>
      h.attributes.getNamedItem(
        grida.program.document.k.HTML_ELEMET_DATA_ATTRIBUTE_GRIDA_NODE_ID_KEY
      )
    );

    return node_elements.map((el) => el.id);
  }

  export interface GeometryQuery {
    /**
     * returns a list of node ids that are intersecting with the point in canvas space
     * @param point
     * @returns
     */
    getNodeIdsFromPoint(point: cmath.Vector2): string[];
    /**
     * returns a list of node ids that are intersecting with the envelope in canvas space
     * @param envelope
     * @returns
     */
    getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[];
    /**
     * returns a bounding rect of the node in canvas space
     * @param node_id
     * @returns
     */
    getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null;
  }

  export class DOMGeometryQuery implements GeometryQuery {
    private content: DOMContentApi;

    constructor(
      readonly _transform: cmath.Transform | (() => cmath.Transform)
    ) {
      this.content = new DOMContentApi(k.EDITOR_CONTENT_ELEMENT_ID);
    }

    get transform(): cmath.Transform {
      if (typeof this._transform === "function") {
        return this._transform();
      }
      return this._transform;
    }

    /**
     * @deprecated not accurately implemented. - does not convert the point.
     */
    getNodeIdsFromPoint(point: cmath.Vector2): string[] {
      // TODO: convert point to window space
      return domapi.getNodeIdsFromPoint(point);
    }

    getNodeIdsFromEnvelope(envelope: cmath.Rectangle): string[] {
      const contained: string[] = [];
      const all_els = this.content.getElements();

      all_els?.forEach((el: INode) => {
        const rect = this.getNodeAbsoluteBoundingRect(el.id);
        if (!rect) return;
        if (cmath.rect.intersects(rect, envelope)) {
          contained.push(el.id);
        }
      });

      return contained;
    }

    getNodeAbsoluteBoundingRect(node_id: string): cmath.Rectangle | null {
      const contentrect = this.content.getBoundingClientRect()!;
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

      const scale = cmath.transform.getScale(this.transform);
      const rect = cmath.rect.scale(
        domrect,
        [0, 0],
        [1 / scale[0], 1 / scale[1]]
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
