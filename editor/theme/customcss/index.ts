import { compile, serialize, stringify } from "stylis";

export namespace CustomCSS {
  /**
   * Compiles nested CSS using Stylis.
   *
   * @param css The nested CSS string.
   * @returns The compiled CSS string.
   */
  export function vanilla(css: string): string {
    css = serialize(compile(css), stringify);
    return css;
  }

  export const DATA_CUSTOM_CSS_KEY = "data-custom-css";
}
