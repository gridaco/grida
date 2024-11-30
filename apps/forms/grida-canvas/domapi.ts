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

  type Offset = { x: number; y: number };

  /**
   * Utility function to calculate the offset of one element (`b`) relative to another (`a`) in terms of `x` and `y` coordinates.
   *
   * The offset is calculated using the `getBoundingClientRect` method of the DOM elements.
   * If either element is `null`, the function returns `null`.
   *
   * @param a - The reference to the parent `HTMLElement` or `null`. This is the element relative to which the offset is calculated.
   * @param b - The reference to the child `HTMLElement` or `null`. This is the element whose offset is being calculated relative to `a`.
   *
   * @returns An object containing the `x` and `y` offsets if both elements are provided, or `null` if either is `null`.
   */
  export function get_offset_between(
    a: HTMLElement | null,
    b: HTMLElement | null
  ): Offset | null {
    if (!a || !b) {
      return null; // Return null if either element is not provided
    }

    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();

    // Calculate the offset of b relative to a
    const x = bRect.left - aRect.left;
    const y = bRect.top - aRect.top;

    return { x, y };
  }
}
