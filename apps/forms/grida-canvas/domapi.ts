import { grida } from "@/grida";
import { cmath } from "./math";
export namespace domapi {
  export namespace k {
    export const VIEWPORT_ELEMENT_ID = "grida-canvas-sdk-viewport";
    export const EDITOR_CONTENT_ELEMENT_ID = "grida-canvas-sdk-editor-content";
  }

  export function get_node_element(node_id: string) {
    return window.document.getElementById(node_id);
  }

  export function get_content_element() {
    return window.document.getElementById(k.EDITOR_CONTENT_ELEMENT_ID);
  }

  export function get_viewport_element() {
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
  export function get_grida_node_elements() {
    const content = get_content_element();
    return content!.querySelectorAll(
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

  /**
   * Utility function to calculate the displacement (offset) of one element (`b`) relative to another (`a`).
   *
   * The offset is calculated as a Vector2 using the `getBoundingClientRect` method of the DOM elements.
   * If either element is `null`, the function returns `null`.
   *
   * @param a - The reference to the parent `HTMLElement` or `null`. This is the element relative to which the offset is calculated.
   * @param b - The reference to the child `HTMLElement` or `null`. This is the element whose offset is being calculated relative to `a`.
   *
   * @returns A `Vector2` containing the offset `[dx, dy]` if both elements are provided, or `null` if either is `null`.
   */
  export function get_displacement_between(
    a: HTMLElement | null,
    b: HTMLElement | null
  ): cmath.Vector2 | null {
    if (!a || !b) {
      return null; // Return null if either element is not provided
    }

    const aRect = a.getBoundingClientRect();
    const bRect = b.getBoundingClientRect();

    // Calculate the displacement as a Vector2
    return cmath.vector2.subtract(
      [bRect.left, bRect.top],
      [aRect.left, aRect.top]
    );
  }
}
