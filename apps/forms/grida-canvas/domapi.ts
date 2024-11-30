import { grida } from "@/grida";
export namespace domapi {
  export namespace k {
    export const VIEWPORT_ELEMENT_ID = "grida-canvas-sdk-viewport";
  }

  export function get_viewport_element() {
    return window.document.getElementById(k.VIEWPORT_ELEMENT_ID);
  }

  export function get_viewport_rect() {
    const el = get_viewport_element();
    return el!.getBoundingClientRect();
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
